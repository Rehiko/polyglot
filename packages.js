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
        url && key &&
        !url.includes("YOUR_SUPABASE") &&
        !key.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let viewer = { user: null, role: null, paidLessons: 0 };

    function showMessage(text, type = "error") {
        pageMessage.textContent = text;
        pageMessage.className = `notice ${type}`;
        pageMessage.hidden = false;
    }

    function formatPrice(amountMinor) {
        return `${(amountMinor / 100).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} грн`;
    }

    async function loadViewer() {
        const { data: userData } = await client.auth.getUser();
        if (!userData.user) {
            balanceElement.textContent = "—";
            accountMessage.textContent = "Log in as a student to buy lessons.";
            return;
        }

        viewer.user = userData.user;
        loginLink.textContent = "Account";
        loginLink.href = "dashboard.html";

        const { data: profile } = await client
            .from("profiles")
            .select("role")
            .eq("id", viewer.user.id)
            .single();
        viewer.role = profile?.role || null;

        if (viewer.role !== "student") {
            balanceElement.textContent = "—";
            accountMessage.textContent = "Lesson packages are available only to student accounts.";
            return;
        }

        const { data: balance } = await client
            .from("student_lesson_balances")
            .select("paid_lessons")
            .eq("student_id", viewer.user.id)
            .maybeSingle();
        viewer.paidLessons = balance?.paid_lessons || 0;
        balanceElement.textContent = String(viewer.paidLessons);
        accountMessage.textContent = "Purchased lessons stay on your balance until you book them.";
    }

    async function startCheckout(lessonPackage, button) {
        if (!viewer.user) {
            sessionStorage.setItem("polyglotReturnAfterLogin", window.location.href);
            window.location.href = "login.html#login";
            return;
        }

        if (viewer.role !== "student") return;

        button.disabled = true;
        button.textContent = "Opening secure checkout...";
        pageMessage.hidden = true;

        const { data, error } = await client.functions.invoke("create-checkout", {
            body: { package_id: lessonPackage.id }
        });

        if (error || !data?.url) {
            const text = data?.error || error?.message || "Checkout could not be opened.";
            showMessage(text);
            button.disabled = false;
            button.textContent = "Buy package";
            return;
        }

        window.location.href = data.url;
    }

    function createPackageCard(lessonPackage) {
        const card = document.createElement("article");
        card.className = "lesson-package-card";
        if (lessonPackage.id === "five") card.classList.add("featured-package");

        const count = document.createElement("span");
        count.className = "package-count";
        count.textContent = String(lessonPackage.lessons_count).padStart(2, "0");

        const title = document.createElement("h2");
        title.textContent = lessonPackage.name;

        const description = document.createElement("p");
        description.textContent = lessonPackage.lessons_count === 1
            ? "A single lesson added to your balance."
            : `${lessonPackage.lessons_count} lessons ready to book with approved teachers.`;

        const price = document.createElement("strong");
        price.className = "package-price";
        price.textContent = formatPrice(lessonPackage.price_minor);

        const priceNote = document.createElement("span");
        priceNote.className = "package-price-note";
        priceNote.textContent = "one-time payment";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary-button package-buy-button";
        button.textContent = !viewer.user
            ? "Log in to buy"
            : viewer.role === "student" ? "Buy package" : "Students only";
        button.disabled = Boolean(viewer.user && viewer.role !== "student");
        button.addEventListener("click", () => startCheckout(lessonPackage, button));

        card.append(count, title, description, price, priceNote, button);
        return card;
    }

    async function initializePage() {
        if (!ready) {
            showMessage("Add your Supabase URL and publishable key to supabase-config.js.");
            return;
        }

        client = window.supabase.createClient(url, key);
        await loadViewer();

        const { data: lessonPackages, error } = await client
            .from("lesson_packages")
            .select("id, name, lessons_count, price_minor, currency, display_order")
            .eq("active", true)
            .eq("currency", "uah")
            .order("display_order", { ascending: true });

        if (error) {
            showMessage("Lesson packages could not be loaded. Run the newest supabase-setup.sql file.");
            return;
        }

        packagesGrid.replaceChildren();
        (lessonPackages || []).forEach((lessonPackage) => {
            packagesGrid.appendChild(createPackageCard(lessonPackage));
        });

        if (!lessonPackages?.length) {
            showMessage("No active lesson packages are available.", "warning");
        }

        if (new URLSearchParams(window.location.search).get("payment") === "cancelled") {
            showMessage("Payment was cancelled. No lessons were added or charged.", "warning");
        }
    }

    initializePage();
})();
