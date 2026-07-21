(function () {
    "use strict";

    const packagesGrid = document.getElementById("packagesGrid");
    const pageMessage = document.getElementById("packagesMessage");
    const balanceElement = document.getElementById("packagesBalance");
    const accountMessage = document.getElementById("packagesAccountMessage");
    const loginLink = document.getElementById("packagesLoginLink");

    const url = window.POLYGLOT_SUPABASE_URL;
    const key = window.POLYGLOT_SUPABASE_KEY;

    const ready = Boolean(
        url &&
        key &&
        !url.includes("YOUR_SUPABASE") &&
        !key.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    const packageIdMap = {
    1: "package_1",
    5: "package_5",
    20: "package_20"
};

    let client = null;
    let viewer = {
        user: null,
        role: null,
        paidLessons: 0
    };

    function showMessage(text, type = "error") {
        pageMessage.textContent = text;
        pageMessage.className = `notice ${type}`;
        pageMessage.hidden = false;
    }

    function hideMessage() {
        pageMessage.hidden = true;
    }

    function formatPrice(amountMinor) {
        return `${(amountMinor / 100).toLocaleString("uk-UA", {
            maximumFractionDigits: 0
        })} грн`;
    }

    async function loadViewer() {
        const { data: userData, error: userError } =
            await client.auth.getUser();

        if (userError || !userData.user) {
            balanceElement.textContent = "—";
            accountMessage.textContent =
                "Log in as a student to buy lessons.";
            return;
        }

        viewer.user = userData.user;

        loginLink.textContent = "Account";
        loginLink.href = "dashboard.html";

        const { data: profile, error: profileError } = await client
            .from("profiles")
            .select("role")
            .eq("id", viewer.user.id)
            .single();

        if (profileError) {
            console.error("Profile error:", profileError);
        }

        viewer.role = profile?.role || null;

        if (viewer.role !== "student") {
            balanceElement.textContent = "—";
            accountMessage.textContent =
                "Lesson packages are available only to student accounts.";
            return;
        }

        const { data: balance, error: balanceError } = await client
            .from("student_lesson_balances")
            .select("paid_lessons")
            .eq("student_id", viewer.user.id)
            .maybeSingle();

        if (balanceError) {
            console.error("Balance error:", balanceError);
        }

        viewer.paidLessons = balance?.paid_lessons || 0;
        balanceElement.textContent = String(viewer.paidLessons);

        accountMessage.textContent =
            "Purchased lessons stay on your balance until you book them.";
    }

    async function refreshBalance() {
        if (!viewer.user || viewer.role !== "student") {
            return;
        }

        const { data: balance } = await client
            .from("student_lesson_balances")
            .select("paid_lessons")
            .eq("student_id", viewer.user.id)
            .maybeSingle();

        viewer.paidLessons = balance?.paid_lessons || 0;
        balanceElement.textContent = String(viewer.paidLessons);
    }

    function createLoginButton() {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "primary-button package-buy-button";
        button.textContent = "Log in to buy";

        button.addEventListener("click", () => {
            sessionStorage.setItem(
                "polyglotReturnAfterLogin",
                window.location.href
            );

            window.location.href = "login.html#login";
        });

        return button;
    }

    function createStudentsOnlyButton() {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "primary-button package-buy-button";
        button.textContent = "Students only";
        button.disabled = true;

        return button;
    }

    function renderPayPalButton(container, lessonPackage) {
        const paypalPackageId =
    packageIdMap[lessonPackage.lessons_count];

        if (!paypalPackageId) {
            container.textContent =
                "This package is not configured for PayPal.";
            return;
        }

        if (!window.paypal) {
            container.textContent =
                "PayPal could not be loaded. Please refresh the page.";
            return;
        }

        window.paypal.Buttons({
            style: {
                layout: "vertical",
                shape: "rect",
                label: "paypal",
                height: 45
            },

            createOrder: async function () {
                hideMessage();

                const { data, error } = await client.functions.invoke(
                    "create-paypal-order",
                    {
                        body: {
                            packageId: paypalPackageId
                        }
                    }
                );

                if (error) {
    console.error("Create order error:", error);

    let message = error.message || "PayPal order could not be created.";

    if (error.context) {
        try {
            const errorBody = await error.context.json();
            console.error("Edge Function response:", errorBody);
            message = errorBody.error || message;
        } catch (contextError) {
            console.error("Could not read function error:", contextError);
        }
    }

    throw new Error(message);
}

                if (!data?.orderId) {
                    console.error("Invalid create-order response:", data);
                    throw new Error(
                        data?.error || "PayPal order ID was not returned."
                    );
                }

                return data.orderId;
            },

            onApprove: async function (data) {
                showMessage(
                    "Payment approved. Confirming your payment...",
                    "warning"
                );

                const { data: captureResult, error } =
                    await client.functions.invoke(
                        "capture-paypal-order",
                        {
                            body: {
                                orderId: data.orderID
                            }
                        }
                    );

                if (error) {
                    console.error("Capture error:", error);

                    showMessage(
                        error.message ||
                        "The payment could not be confirmed."
                    );

                    return;
                }

                if (!captureResult?.success) {
                    console.error(
                        "Incomplete capture response:",
                        captureResult
                    );

                    showMessage(
                        captureResult?.error ||
                        "PayPal did not confirm the payment."
                    );

                    return;
                }

                showMessage(
                    "Payment successful! Your PayPal payment has been confirmed.",
                    "success"
                );

                await refreshBalance();
            },

            onCancel: function () {
                showMessage(
                    "Payment was cancelled. No payment was completed.",
                    "warning"
                );
            },

            onError: function (error) {
                console.error("PayPal Checkout error:", error);

                showMessage(
                    error?.message ||
                    "Something went wrong while opening PayPal."
                );
            }
        }).render(container);
    }

    function createPackageCard(lessonPackage) {
        const card = document.createElement("article");
        card.className = "lesson-package-card";

        if (lessonPackage.id === "five") {
            card.classList.add("featured-package");
        }

        const count = document.createElement("span");
        count.className = "package-count";
        count.textContent = String(
            lessonPackage.lessons_count
        ).padStart(2, "0");

        const title = document.createElement("h2");
        title.textContent = lessonPackage.name;

        const description = document.createElement("p");

        description.textContent =
            lessonPackage.lessons_count === 1
                ? "A single lesson added to your balance."
                : `${lessonPackage.lessons_count} lessons ready to book with approved teachers.`;

        const price = document.createElement("strong");
        price.className = "package-price";
        price.textContent = formatPrice(
            lessonPackage.price_minor
        );

        const priceNote = document.createElement("span");
        priceNote.className = "package-price-note";
        priceNote.textContent = "one-time payment";

        card.append(
            count,
            title,
            description,
            price,
            priceNote
        );

        if (!viewer.user) {
            card.appendChild(createLoginButton());
            return card;
        }

        if (viewer.role !== "student") {
            card.appendChild(createStudentsOnlyButton());
            return card;
        }

        const paypalContainer = document.createElement("div");
        paypalContainer.className = "paypal-button-container";

        card.appendChild(paypalContainer);

        setTimeout(() => {
            renderPayPalButton(
                paypalContainer,
                lessonPackage
            );
        }, 0);

        return card;
    }

    async function initializePage() {
        if (!ready) {
            showMessage(
                "Add your Supabase URL and publishable key to supabase-config.js."
            );
            return;
        }

        client = window.supabase.createClient(url, key);

        await loadViewer();

        const { data: lessonPackages, error } = await client
            .from("lesson_packages")
            .select(
                "id, name, lessons_count, price_minor, currency, display_order"
            )
            .eq("active", true)
            .eq("currency", "uah")
            .order("display_order", {
                ascending: true
            });

        if (error) {
            console.error("Packages error:", error);

            showMessage(
                "Lesson packages could not be loaded. Run the newest supabase-setup.sql file."
            );

            return;
        }

        packagesGrid.replaceChildren();

        (lessonPackages || []).forEach((lessonPackage) => {
            packagesGrid.appendChild(
                createPackageCard(lessonPackage)
            );
        });

        if (!lessonPackages?.length) {
            showMessage(
                "No active lesson packages are available.",
                "warning"
            );
        }
    }

    initializePage();
})();