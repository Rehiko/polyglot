const dashboardMessage =
    document.getElementById("dashboardMessage");

const routerLoginLink =
    document.getElementById("routerLoginLink");

const supabaseUrl =
    window.POLYGLOT_SUPABASE_URL;

const supabaseKey =
    window.POLYGLOT_SUPABASE_KEY;

const configIsReady = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

function showRouterError(text) {
    dashboardMessage.textContent = text;
    dashboardMessage.classList.add("router-error");
    routerLoginLink.hidden = false;

    document.querySelector(
        ".loading-spinner"
    ).hidden = true;
}

if (!configIsReady) {
    showRouterError(
        "Add your Supabase URL and publishable key to supabase-config.js."
    );
} else {
    const supabaseClient =
        window.supabase.createClient(
            supabaseUrl,
            supabaseKey
        );

    async function routeUser() {
        const {
            data: userData,
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace(
                "login.html#login"
            );

            return;
        }

        const {
            data: isAdmin,
            error: adminError
        } = await supabaseClient.rpc(
            "is_current_user_admin"
        );

        if (adminError) {
            showRouterError(
                "Administrator access could not be checked."
            );

            return;
        }

        if (isAdmin) {
            window.location.replace(
                "admin-dashboard.html"
            );

            return;
        }

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("role")
            .eq("id", userData.user.id)
            .single();

        if (profileError || !profile) {
            showRouterError(
                "Your account exists, but its profile was not found."
            );

            return;
        }

        const destination =
            profile.role === "teacher"
                ? "teacher-dashboard.html"
                : "student-dashboard.html";

        window.location.replace(destination);
    }

    routeUser();
}