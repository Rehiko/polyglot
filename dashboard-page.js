const expectedRole = document.body.dataset.dashboardRole;
const dashboardMessage = document.getElementById("dashboardMessage");
const dashboardContent = document.getElementById("dashboardContent");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
const configIsReady = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

function showDashboardError(text) {
    dashboardMessage.textContent = text;
    dashboardMessage.className = "notice error";
    dashboardMessage.hidden = false;
}

function roleDestination(role) {
    return role === "teacher" ? "teacher-dashboard.html" : "student-dashboard.html";
}

if (!configIsReady) {
    showDashboardError("Add your Supabase URL and publishable key to supabase-config.js.");
} else {
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

    function formatLessonDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function transactionTitle(type) {
        if (type === "purchase") return "Lesson package purchased";
        if (type === "booking") return "Lesson booked";
        if (type === "refund") return "Lesson returned";
        return "Balance adjusted";
    }

    function renderLessonTransactions(transactions) {
        const list = document.getElementById("lessonTransactionList");
        list.replaceChildren();

        if (!transactions.length) {
            const empty = document.createElement("p");
            empty.className = "empty-transactions";
            empty.textContent = "Purchases and paid lesson bookings will appear here.";
            list.appendChild(empty);
            return;
        }

        transactions.forEach((transaction) => {
            const item = document.createElement("article");
            item.className = "lesson-transaction-item";

            const details = document.createElement("div");
            const title = document.createElement("strong");
            const date = document.createElement("span");
            title.textContent = transactionTitle(transaction.transaction_type);
            date.textContent = new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }).format(new Date(transaction.created_at));
            details.append(title, date);

            const amount = document.createElement("strong");
            amount.className = transaction.lesson_delta > 0 ? "credit-positive" : "credit-negative";
            amount.textContent = `${transaction.lesson_delta > 0 ? "+" : ""}${transaction.lesson_delta}`;

            const balance = document.createElement("span");
            balance.className = "transaction-balance";
            balance.textContent = `Balance: ${transaction.balance_after}`;

            item.append(details, amount, balance);
            list.appendChild(item);
        });
    }

    async function loadStudentOverview(studentId) {
        const { data: balance, error: balanceError } = await supabaseClient
            .from("student_lesson_balances")
            .select("paid_lessons, free_trial_used_at")
            .eq("student_id", studentId)
            .maybeSingle();

        if (balanceError) {
            showDashboardError("Lesson balance could not be loaded. Run the newest supabase-setup.sql file.");
            return false;
        }

        document.getElementById("paidLessonBalance").textContent = balance?.paid_lessons || 0;
        document.getElementById("freeTrialStatus").textContent = balance?.free_trial_used_at
            ? "Your free trial lesson has been used."
            : "You have one free trial lesson available.";

        const { data: booking, error: bookingError } = await supabaseClient
            .from("lesson_bookings")
            .select("teacher_id, starts_at, ends_at")
            .eq("student_id", studentId)
            .eq("status", "scheduled")
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (bookingError) {
            showDashboardError("Upcoming lessons could not be loaded. Run the newest supabase-setup.sql file.");
            return false;
        }

        if (booking) {
            const { data: teacher } = await supabaseClient
                .from("profiles")
                .select("full_name")
                .eq("id", booking.teacher_id)
                .maybeSingle();

            document.getElementById("studentNextLessonTitle").textContent =
                teacher?.full_name || "Your next lesson";
            document.getElementById("studentNextLessonText").textContent =
                formatLessonDate(booking.starts_at);
        }

        const { data: transactions, error: transactionsError } = await supabaseClient
            .from("lesson_credit_transactions")
            .select("transaction_type, lesson_delta, balance_after, created_at")
            .eq("student_id", studentId)
            .order("created_at", { ascending: false })
            .limit(8);

        if (transactionsError) {
            showDashboardError("Lesson balance history could not be loaded. Run the newest supabase-setup.sql file.");
            return false;
        }

        renderLessonTransactions(transactions || []);

        return true;
    }

    async function loadDashboard() {
        const { data: userData, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace("login.html#login");
            return;
        }

        const { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("full_name, role, avatar_url")
            .eq("id", userData.user.id)
            .single();

        if (profileError || !profile) {
            showDashboardError(
                "Profile could not be loaded. Make sure supabase-setup.sql has been run in Supabase."
            );
            return;
        }

        if (profile.role !== expectedRole) {
            window.location.replace(roleDestination(profile.role));
            return;
        }

        document.getElementById("userName").textContent = profile.full_name;
        document.getElementById("userEmail").textContent = userData.user.email || "";

        if (expectedRole === "teacher") {
            const { data: teacherProfile, error: teacherError } = await supabaseClient
                .from("teacher_profiles")
                .select("approval_status")
                .eq("user_id", userData.user.id)
                .single();

            if (teacherError || !teacherProfile) {
                showDashboardError("Teacher profile could not be loaded.");
                return;
            }

            const statusElement = document.getElementById("approvalStatus");
            const noticeElement = document.getElementById("approvalNotice");
            const status = teacherProfile.approval_status;

            statusElement.textContent = status;
            statusElement.className = `approval-status ${status}`;

            if (status === "approved") {
                noticeElement.textContent = "Your teacher profile has been approved and can be published after you complete it.";
                noticeElement.classList.add("approved");
            } else if (status === "rejected") {
                noticeElement.textContent = "Your teacher application needs changes. Contact Polyglot support for more information.";
                noticeElement.classList.add("rejected");
            }
        } else {
            const overviewLoaded = await loadStudentOverview(userData.user.id);
            if (!overviewLoaded) return;
        }

        dashboardMessage.hidden = true;
        dashboardContent.hidden = false;
    }

    document.getElementById("logoutButton").addEventListener("click", async () => {
        const button = document.getElementById("logoutButton");
        button.disabled = true;
        button.textContent = "Logging out...";

        await supabaseClient.auth.signOut();
        window.location.replace("login.html#login");
    });

    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            window.location.replace("login.html#login");
        }
    });

    loadDashboard();
}
