import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

Deno.serve(async (request) => {
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const signature = request.headers.get("Stripe-Signature");

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
        return jsonResponse({ error: "Webhook secrets are incomplete." }, 500);
    }

    if (!signature) {
        return jsonResponse({ error: "Stripe signature is missing." }, 400);
    }

    const stripe = new Stripe(stripeSecretKey);
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    const rawBody = await request.text();
    let event: Stripe.Event;

    try {
        event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            webhookSecret,
            undefined,
            cryptoProvider
        );
    } catch (error) {
        console.error("Invalid Stripe webhook signature:", error);
        return jsonResponse({ error: "Invalid webhook signature." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });

    try {
        if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.payment_status !== "paid") {
                return jsonResponse({ received: true });
            }

            const purchaseId = session.metadata?.purchase_id;
            if (!purchaseId || session.amount_total === null || !session.currency) {
                throw new Error("Paid Checkout Session is missing purchase metadata.");
            }

            const paymentIntentId = typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || "";

            const { error } = await adminClient.rpc("complete_lesson_purchase", {
                p_purchase_id: purchaseId,
                p_checkout_session_id: session.id,
                p_payment_intent_id: paymentIntentId,
                p_amount_total: session.amount_total,
                p_currency: session.currency
            });

            if (error) throw error;
        }

        if (
            event.type === "checkout.session.expired" ||
            event.type === "checkout.session.async_payment_failed"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;
            const purchaseId = session.metadata?.purchase_id;
            if (purchaseId) {
                await adminClient
                    .from("lesson_purchases")
                    .update({
                        status: event.type === "checkout.session.expired" ? "expired" : "failed"
                    })
                    .eq("id", purchaseId)
                    .eq("status", "pending");
            }
        }

        return jsonResponse({ received: true });
    } catch (error) {
        console.error(`Stripe webhook ${event.id} failed:`, error);
        return jsonResponse({ error: "Webhook processing failed." }, 500);
    }
});
