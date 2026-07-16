const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authTabs = document.querySelectorAll("[data-tab]");
const setupNotice = document.getElementById("setupNotice");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
const configIsReady = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

const supabaseClient = configIsReady
    ? window.supabase.createClient(supabaseUrl, supabaseKey)
    : null;

if (!configIsReady) {
    setupNotice.hidden = false;
}

function openTab(tabName) {
    const showLogin = tabName === "login";

    loginForm.hidden = !showLogin;
    registerForm.hidden = showLogin;

    authTabs.forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });

    const newHash = showLogin ? "login" : "register";
    history.replaceState(null, "", `#${newHash}`);
}

authTabs.forEach((tab) => {
    tab.addEventListener("click", () => openTab(tab.dataset.tab));
});

document.querySelectorAll("[data-open-tab]").forEach((button) => {
    button.addEventListener("click", () => openTab(button.dataset.openTab));
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        const showingPassword = input.type === "text";

        input.type = showingPassword ? "password" : "text";
        button.textContent = showingPassword ? "Show" : "Hide";
        button.setAttribute("aria-label", showingPassword ? "Show password" : "Hide password");
    });
});

function showMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `notice ${type}`;
    element.hidden = false;
}

function clearMessage(element) {
    element.textContent = "";
    element.className = "notice";
    element.hidden = true;
}

function setFieldError(inputId, message = "") {
    const input = document.getElementById(inputId);
    const error = document.querySelector(`[data-error-for="${inputId}"]`);

    if (input) input.classList.toggle("invalid", Boolean(message));
    if (error) error.textContent = message;
}

function setLoading(button, loading, defaultText) {
    button.disabled = loading;
    button.querySelector("span:first-child").textContent = loading ? "Please wait..." : defaultText;
}

function ensureConfiguration(messageElement) {
    if (supabaseClient) return true;

    showMessage(
        messageElement,
        "Authentication is not connected yet. Add your Supabase URL and publishable key to supabase-config.js.",
        "error"
    );
    return false;
}

function redirectToDashboard() {
    const savedReturnUrl = sessionStorage.getItem("polyglotReturnAfterLogin");
    if (savedReturnUrl) {
        sessionStorage.removeItem("polyglotReturnAfterLogin");
        try {
            const returnUrl = new URL(savedReturnUrl, window.location.href);
            const allowedPages = ["/teacher-profile.html", "/packages.html", "/payment-success.html"];
            const isAllowedPage = allowedPages.some((page) => returnUrl.pathname.endsWith(page));
            if (returnUrl.origin === window.location.origin && isAllowedPage) {
                window.location.href = returnUrl.href;
                return;
            }
        } catch (error) {
            console.warn("Saved return URL was invalid.", error);
        }
    }
    window.location.href = "dashboard.html";
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    const message = document.getElementById("loginMessage");
    const button = loginForm.querySelector("button[type='submit']");

    clearMessage(message);
    setFieldError("loginEmail");
    setFieldError("loginPassword");

    let valid = true;

    if (!emailInput.validity.valid) {
        setFieldError("loginEmail", "Enter a valid email address.");
        valid = false;
    }

    if (!passwordInput.value) {
        setFieldError("loginPassword", "Enter your password.");
        valid = false;
    }

    if (!valid || !ensureConfiguration(message)) return;

    setLoading(button, true, "Log in");

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        if (error) throw error;

        showMessage(message, "Login successful. Opening your dashboard...", "success");
        setTimeout(redirectToDashboard, 500);
    } catch (error) {
        const friendlyMessage = error.message.toLowerCase().includes("invalid login")
            ? "The email or password is incorrect."
            : error.message;
        showMessage(message, friendlyMessage, "error");
    } finally {
        setLoading(button, false, "Log in");
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nameInput = document.getElementById("registerName");
    const emailInput = document.getElementById("registerEmail");
    const passwordInput = document.getElementById("registerPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const termsInput = document.getElementById("acceptTerms");
    const role = registerForm.querySelector("input[name='role']:checked").value;
    const message = document.getElementById("registerMessage");
    const button = registerForm.querySelector("button[type='submit']");

    clearMessage(message);
    ["registerName", "registerEmail", "registerPassword", "confirmPassword", "acceptTerms"]
        .forEach((id) => setFieldError(id));

    let valid = true;
    const containsLetter = /[a-zA-Z]/.test(passwordInput.value);
    const containsNumber = /\d/.test(passwordInput.value);

    if (nameInput.value.trim().length < 2) {
        setFieldError("registerName", "Enter your full name.");
        valid = false;
    }

    if (!emailInput.validity.valid) {
        setFieldError("registerEmail", "Enter a valid email address.");
        valid = false;
    }

    if (passwordInput.value.length < 8 || !containsLetter || !containsNumber) {
        setFieldError("registerPassword", "Use at least 8 characters with a letter and a number.");
        valid = false;
    }

    if (confirmInput.value !== passwordInput.value) {
        setFieldError("confirmPassword", "The passwords do not match.");
        valid = false;
    }

    if (!termsInput.checked) {
        setFieldError("acceptTerms", "You must accept the Terms and Privacy Policy.");
        valid = false;
    }

    if (!valid || !ensureConfiguration(message)) return;

    setLoading(button, true, "Create account");

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: emailInput.value.trim(),
            password: passwordInput.value,
            options: {
                data: {
                    full_name: nameInput.value.trim(),
                    role
                }
            }
        });

        if (error) throw error;

        if (data.session) {
            showMessage(message, "Account created. Opening your dashboard...", "success");
            setTimeout(redirectToDashboard, 600);
        } else {
            registerForm.reset();
            showMessage(
                message,
                "Account created. Check your email and click the confirmation link before logging in.",
                "success"
            );
        }
    } catch (error) {
        showMessage(message, error.message, "error");
    } finally {
        setLoading(button, false, "Create account");
    }
});

const resetDialog = document.getElementById("resetDialog");
const resetRequestForm = document.getElementById("resetRequestForm");

document.getElementById("forgotPasswordButton").addEventListener("click", () => {
    document.getElementById("resetEmail").value = document.getElementById("loginEmail").value;
    resetDialog.showModal();
});

document.getElementById("closeResetDialog").addEventListener("click", () => {
    resetDialog.close();
});

resetDialog.addEventListener("click", (event) => {
    if (event.target === resetDialog) resetDialog.close();
});

resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById("resetEmail");
    const message = document.getElementById("resetMessage");
    const button = resetRequestForm.querySelector("button[type='submit']");

    clearMessage(message);

    if (!emailInput.validity.valid) {
        showMessage(message, "Enter a valid email address.", "error");
        return;
    }

    if (!ensureConfiguration(message)) return;

    setLoading(button, true, "Send reset link");

    try {
        const options = window.location.protocol.startsWith("http")
            ? { redirectTo: new URL("reset-password.html", window.location.href).href }
            : {};

        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            emailInput.value.trim(),
            options
        );

        if (error) throw error;

        showMessage(message, "Password reset link sent. Check your email.", "success");
    } catch (error) {
        showMessage(message, error.message, "error");
    } finally {
        setLoading(button, false, "Send reset link");
    }
});

if (window.location.hash === "#register") {
    openTab("register");
} else {
    openTab("login");
}

if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
        if (data.session) redirectToDashboard();
    });
}
