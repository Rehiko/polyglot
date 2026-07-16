import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeSecretKey || !siteUrl) {
        return jsonResponse({ error: "Payment function secrets are incomplete." }, 500);
    }

    if (!authorization) {
        return jsonResponse({ error: "Log in before buying lessons." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
        return jsonResponse({ error: "Your login session is no longer valid." }, 401);
    }

    let purchaseId: string | null = null;
    let checkoutWasCreated = false;

    try {
        const body = await request.json();
        const packageId = typeof body?.package_id === "string" ? body.package_id : "";
        if (!packageId) {
            return jsonResponse({ error: "Choose a lesson package." }, 400);
        }

        const [{ data: profile, error: profileError }, { data: lessonPackage, error: packageError }] =
            await Promise.all([
                adminClient
                    .from("profiles")
                    .select("role")
                    .eq("id", userData.user.id)
                    .single(),
                adminClient
                    .from("lesson_packages")
                    .select("id, name, lessons_count, price_minor, currency, active")
                    .eq("id", packageId)
                    .eq("active", true)
                    .single()
            ]);

        if (profileError || profile?.role !== "student") {
            return jsonResponse({ error: "Only student accounts can buy lesson packages." }, 403);
        }

        if (packageError || !lessonPackage) {
            return jsonResponse({ error: "This lesson package is unavailable." }, 404);
        }

        if (lessonPackage.currency !== "uah") {
            return jsonResponse({ error: "Only UAH lesson packages are enabled." }, 400);
        }

        const { data: purchase, error: purchaseError } = await adminClient
            .from("lesson_purchases")
            .insert({
                student_id: userData.user.id,
                package_id: lessonPackage.id,
                lesson_count: lessonPackage.lessons_count,
                amount_minor: lessonPackage.price_minor,
                currency: lessonPackage.currency,
                status: "pending"
            })
            .select("id")
            .single();

        if (purchaseError || !purchase) throw purchaseError || new Error("Purchase could not be created.");
        purchaseId = purchase.id;

        const stripe = new Stripe(stripeSecretKey);
        const successPageUrl = new URL("payment-success.html", `${siteUrl}/`).toString();
        const successUrl = `${successPageUrl}?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = new URL("packages.html", `${siteUrl}/`);
        cancelUrl.searchParams.set("payment", "cancelled");

        const metadata = {
            purchase_id: purchase.id,
            student_id: userData.user.id,
            package_id: lessonPackage.id
        };

        const checkout = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            customer_email: userData.user.email || undefined,
            client_reference_id: userData.user.id,
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: "uah",
                    unit_amount: lessonPackage.price_minor,
                    product_data: {
                        name: `Polyglot — ${lessonPackage.name}`,
                        description: `${lessonPackage.lessons_count} lesson credit${lessonPackage.lessons_count === 1 ? "" : "s"}`
                    }
                }
            }],
            metadata,
            payment_intent_data: { metadata },
            success_url: successUrl,
            cancel_url: cancelUrl.toString()
        }, {
            idempotencyKey: `polyglot_purchase_${purchase.id}`
        });
        checkoutWasCreated = true;

        const { error: sessionUpdateError } = await adminClient
            .from("lesson_purchases")
            .update({ stripe_checkout_session_id: checkout.id })
            .eq("id", purchase.id);

        if (sessionUpdateError) {
            console.error("Checkout session ID could not be saved before redirect:", sessionUpdateError);
        }

        if (!checkout.url) throw new Error("Stripe did not return a Checkout URL.");
        return jsonResponse({ url: checkout.url });
    } catch (error) {
        console.error("Create Checkout failed:", error);

        if (purchaseId && !checkoutWasCreated) {
            await adminClient
                .from("lesson_purchases")
                .update({ status: "failed" })
                .eq("id", purchaseId)
                .eq("status", "pending");
        }

        return jsonResponse({ error: "Checkout could not be created. Please try again." }, 500);
    }
});
