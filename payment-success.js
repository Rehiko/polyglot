(function () {
    "use strict";

    const title = document.getElementById("paymentResultTitle");
    const text = document.getElementById("paymentResultText");
    const icon = document.getElementById("paymentResultIcon");
    const details = document.getElementById("paymentResultDetails");
    const sessionId = new URLSearchParams(window.location.search).get("session_id");

    const url = window.POLYGLOT_SUPABASE_URL;
    const key = window.POLYGLOT_SUPABASE_KEY;
    const ready = Boolean(
        url && key &&
        !url.includes("YOUR_SUPABASE") &&
        !key.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    function showError(message) {
        icon.className = "payment-result-icon error";
        icon.textContent = "!";
        title.textContent = "Payment status unavailable";
        text.textContent = message;
    }

    function wait(milliseconds) {
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    async function initializeResult() {
        if (!ready || !sessionId) {
            showError(!sessionId
                ? "The Stripe Checkout Session ID is missing."
                : "Add your Supabase configuration first.");
            return;
        }

        const client = window.supabase.createClient(url, key);
        const { data: userData } = await client.auth.getUser();
        if (!userData.user) {
            sessionStorage.setItem("polyglotReturnAfterLogin", window.location.href);
            window.location.href = "login.html#login";
            return;
        }

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const { data: purchase, error } = await client
                .from("lesson_purchases")
                .select("status, lesson_count, amount_minor, currency")
                .eq("stripe_checkout_session_id", sessionId)
                .maybeSingle();

            if (error) {
                showError("The purchase could not be checked. Run the newest database update.");
                return;
            }

            if (purchase?.status === "paid") {
                const { data: balance } = await client
                    .from("student_lesson_balances")
                    .select("paid_lessons")
                    .eq("student_id", userData.user.id)
                    .maybeSingle();

                icon.className = "payment-result-icon success";
                icon.textContent = "✓";
                title.textContent = "Lessons added successfully";
                text.textContent = "Stripe confirmed the payment and your balance is ready to use.";
                details.hidden = false;
                details.textContent = `+${purchase.lesson_count} lessons · Current balance: ${balance?.paid_lessons || 0}`;
                return;
            }

            if (purchase && ["failed", "expired", "refunded"].includes(purchase.status)) {
                showError("The payment was not completed. No lessons were added.");
                return;
            }

            await wait(1500);
        }

        title.textContent = "Payment is still processing";
        text.textContent = "Stripe has not finished confirming the payment yet. Refresh this page in a moment.";
    }

    initializeResult();
})();
