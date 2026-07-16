const form = document.getElementById("newPasswordForm");
const message = document.getElementById("passwordMessage");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
const configIsReady = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

const showMessage = (text, type = "error") => {
    message.textContent = text;
    message.className = `notice ${type}`;
    message.hidden = false;
};

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.textContent = visible ? "Show" : "Hide";
    });
});

if (!configIsReady) {
    showMessage("Add your Supabase details to supabase-config.js first.", "warning");
} else {
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

    async function hasRecoverySession() {
        const { data } = await supabaseClient.auth.getSession();
        return Boolean(data.session);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = document.getElementById("newPassword").value;
        const confirmation = document.getElementById("confirmNewPassword").value;
        const button = form.querySelector("button[type='submit']");

        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
            showMessage("Use at least 8 characters with a letter and a number.");
            return;
        }

        if (password !== confirmation) {
            showMessage("The passwords do not match.");
            return;
        }

        if (!(await hasRecoverySession())) {
            showMessage("This reset link is invalid or has expired. Request a new link from the login page.");
            return;
        }

        button.disabled = true;
        button.querySelector("span:first-child").textContent = "Please wait...";

        const { error } = await supabaseClient.auth.updateUser({ password });

        if (error) {
            showMessage(error.message);
            button.disabled = false;
            button.querySelector("span:first-child").textContent = "Update password";
            return;
        }

        showMessage("Your password has been updated. Redirecting to your dashboard...", "success");
        setTimeout(() => window.location.replace("dashboard.html"), 1000);
    });
}
