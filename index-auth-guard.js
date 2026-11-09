(function protectIndexPage() {
    "use strict";

    // Install before the page becomes interactive, including while auth loads.
    let session = null;

    async function initialiseAuth() {
        try {
            if (!window.supabase || !window.POLYGLOT_SUPABASE_URL || !window.POLYGLOT_SUPABASE_KEY) return;
            const client = window.supabase.createClient(
                window.POLYGLOT_SUPABASE_URL, window.POLYGLOT_SUPABASE_KEY
            );
            let authChanged = false;
            client.auth.onAuthStateChange((_event, nextSession) => {
                authChanged = true;
                session = nextSession;
            });
            const { data, error } = await client.auth.getSession();
            if (!authChanged) session = error ? null : data?.session;
        } catch (error) {
            console.warn("Could not check the current session.", error);
        }
    }

    function continueTo(destination) {
        // Never make a guest click wait for the CDN, auth refresh or network.
        // The auth page already resumes a valid existing session if necessary.
        if (session) {
            window.location.href = destination;
            return;
        }
        try {
            sessionStorage.setItem("polyglotReturnAfterLogin", new URL(destination, window.location.href).href);
        } catch (_error) {
            // Registration must also work when browser storage is unavailable.
        }
        window.location.href = "login.html#register";
    }

    function guardAction(event) {
        if (event.type === "auxclick" && event.button !== 1) return;
        const action = event.target.closest?.("[data-require-auth]");
        if (!action) return;
        const destination = action.dataset.destination || action.getAttribute("href") || "teachers.html";
        event.preventDefault();
        event.stopImmediatePropagation();
        continueTo(destination);
    }

    document.addEventListener("click", guardAction, true);
    document.addEventListener("auxclick", guardAction, true);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialiseAuth, { once: true });
    } else {
        void initialiseAuth();
    }
})();
