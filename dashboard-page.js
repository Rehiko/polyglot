const expectedRole = document.body.dataset.dashboardRole;
const dashboardMessage = document.getElementById("dashboardMessage");
const dashboardContent = document.getElementById("dashboardContent");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;

let activeStudentId = null;

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

function showDashboardNotice(text, type = "success") {
    dashboardMessage.textContent = text;
    dashboardMessage.className = `notice ${type}`;
    dashboardMessage.hidden = false;

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function roleDestination(role) {
    return role === "teacher"
        ? "teacher-dashboard.html"
        : "student-dashboard.html";
}

if (!configIsReady) {
    showDashboardError(
        "Add your Supabase URL and publishable key to supabase-config.js."
    );
} else {
    const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);

window.POLYGLOT_DASHBOARD_CLIENT = supabaseClient;

    function formatLessonDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function formatLessonTime(value) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function isSafeGoogleMeetUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            url.hostname === "meet.google.com"
        );
    } catch {
        return false;
    }
}

    function transactionTitle(type) {
        if (type === "purchase") return "Lesson package purchased";
        if (type === "booking") return "Lesson booked";
        if (type === "refund") return "Lesson returned";
        return "Balance adjusted";
    }

    function renderLessonTransactions(transactions) {
        const list = document.getElementById("lessonTransactionList");

        if (!list) return;

        list.replaceChildren();

        if (!transactions.length) {
            const empty = document.createElement("p");
            empty.className = "empty-transactions";
            empty.textContent =
                "Purchases and paid lesson bookings will appear here.";

            list.appendChild(empty);
            return;
        }

        transactions.forEach((transaction) => {
            const item = document.createElement("article");
            item.className = "lesson-transaction-item";

            const details = document.createElement("div");

            const title = document.createElement("strong");
            title.textContent = transactionTitle(
                transaction.transaction_type
            );

            const date = document.createElement("span");
            date.textContent = new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }).format(new Date(transaction.created_at));

            details.append(title, date);

            const amount = document.createElement("strong");
            amount.className =
                transaction.lesson_delta > 0
                    ? "credit-positive"
                    : "credit-negative";

            amount.textContent =
                `${transaction.lesson_delta > 0 ? "+" : ""}` +
                transaction.lesson_delta;

            const balance = document.createElement("span");
            balance.className = "transaction-balance";
            balance.textContent =
                `Balance: ${transaction.balance_after}`;

            item.append(details, amount, balance);
            list.appendChild(item);
        });
    }

    function getBookingDisplayStatus(booking) {
        if (booking.status === "cancelled") {
            return "Cancelled";
        }

        if (booking.status === "completed") {
            return "Completed";
        }

        if (
            booking.status === "scheduled" &&
            new Date(booking.starts_at).getTime() <= Date.now()
        ) {
            return "Completed";
        }

        return "Scheduled";
    }

    async function loadTeacherNames(bookings) {
        const teacherIds = [
            ...new Set(
                bookings
                    .map((booking) => booking.teacher_id)
                    .filter(Boolean)
            )
        ];

        if (!teacherIds.length) {
            return new Map();
        }

        const { data: teachers, error } = await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", teacherIds);

        if (error) {
            throw error;
        }

        return new Map(
            (teachers || []).map((teacher) => [
                teacher.id,
                teacher.full_name
            ])
        );
    }

    function renderLessonList(
        elementId,
        bookings,
        teacherNames,
        isUpcoming
    ) {
        const list = document.getElementById(elementId);

        if (!list) return;

        list.replaceChildren();

        if (!bookings.length) {
            const empty = document.createElement("p");
            empty.className = "empty-transactions";

            empty.textContent = isUpcoming
                ? "You do not have any upcoming lessons."
                : "Your previous and cancelled lessons will appear here.";

            list.appendChild(empty);
            return;
        }

        bookings.forEach((booking) => {
            const item = document.createElement("article");
            item.className = "dashboard-lesson-item";

            const information = document.createElement("div");
            information.className = "dashboard-lesson-information";

            const topRow = document.createElement("div");
            topRow.className = "dashboard-lesson-top-row";

            const teacherName = document.createElement("strong");
            teacherName.className = "dashboard-lesson-teacher";
            teacherName.textContent =
                teacherNames.get(booking.teacher_id) ||
                "Polyglot teacher";

            const displayStatus = getBookingDisplayStatus(booking);

            const status = document.createElement("span");
            status.className =
                `lesson-status-badge ${displayStatus.toLowerCase()}`;
            status.textContent = displayStatus;

            topRow.append(teacherName, status);

            const lessonDate = document.createElement("p");
            lessonDate.className = "dashboard-lesson-date";
            lessonDate.textContent = formatLessonDate(
                booking.starts_at
            );

            const lessonDetails = document.createElement("p");
            lessonDetails.className = "dashboard-lesson-details";

            const lessonType =
                booking.credit_source === "free_trial"
                    ? "Free trial lesson"
                    : "Paid lesson";

            lessonDetails.textContent =
                `${lessonType} · Ends at ` +
                formatLessonTime(booking.ends_at);

            information.append(
                topRow,
                lessonDate,
                lessonDetails
            );

            item.appendChild(information);

            if (isUpcoming) {
                const actions = document.createElement("div");
                actions.className = "dashboard-lesson-actions";

                const hoursUntilLesson =
                    (
                        new Date(booking.starts_at).getTime() -
                        Date.now()
                    ) / (1000 * 60 * 60);

                const refundable = hoursUntilLesson >= 24;

                const cancellationNote =
                    document.createElement("span");

                cancellationNote.className =
                    refundable
                        ? "cancellation-note refundable"
                        : "cancellation-note late";

                if (refundable) {
                    cancellationNote.textContent =
                        booking.credit_source === "free_trial"
                            ? "Your free trial will be returned."
                            : "One lesson will be returned.";
                } else {
                    cancellationNote.textContent =
                        "Less than 24 hours remain. No credit refund.";
                }

                const cancelButton =
                    document.createElement("button");

                cancelButton.type = "button";
                cancelButton.className = "cancel-lesson-button";
                cancelButton.textContent = "Cancel lesson";

                cancelButton.addEventListener("click", () => {
                    cancelLesson(booking, cancelButton);
                });

                if (isSafeGoogleMeetUrl(booking.meeting_url)) {
                const joinMeetingLink =
                    document.createElement("a");

                joinMeetingLink.className =
                    "join-meeting-button";

                joinMeetingLink.href =
                    booking.meeting_url;

                joinMeetingLink.target = "_blank";
                joinMeetingLink.rel = "noopener noreferrer";
                joinMeetingLink.textContent =
                    "Join Google Meet →";

                actions.appendChild(joinMeetingLink);
            }

            actions.append(
                cancellationNote,
                cancelButton
            );

                item.appendChild(actions);
            }

            list.appendChild(item);
        });
    }

    async function cancelLesson(booking, button) {
        const hoursUntilLesson =
            (
                new Date(booking.starts_at).getTime() -
                Date.now()
            ) / (1000 * 60 * 60);

        const refundable = hoursUntilLesson >= 24;

        let confirmationText =
            "Are you sure you want to cancel this lesson?";

        if (refundable) {
            confirmationText +=
                booking.credit_source === "free_trial"
                    ? "\n\nYour free trial lesson will become available again."
                    : "\n\nOne lesson will be returned to your balance.";
        } else {
            confirmationText +=
                "\n\nLess than 24 hours remain, so the lesson will not be returned.";
        }

        const confirmed = window.confirm(confirmationText);

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Cancelling...";

        const { data, error } = await supabaseClient.rpc(
            "cancel_lesson",
            {
                p_booking_id: booking.id
            }
        );

        if (error) {
            button.disabled = false;
            button.textContent = "Cancel lesson";

            showDashboardNotice(
                error.message || "The lesson could not be cancelled.",
                "error"
            );

            return;
        }

        const result = Array.isArray(data)
            ? data[0]
            : data;

        const overviewLoaded =
            await loadStudentOverview(activeStudentId);

        if (!overviewLoaded) return;

        showDashboardNotice(
            result?.result_message || "Lesson cancelled.",
            "success"
        );
    }

    async function loadStudentOverview(studentId) {
        activeStudentId = studentId;

        const now = new Date();
        const nowIso = now.toISOString();

        const [
            balanceResult,
            bookingsResult,
            transactionsResult
        ] = await Promise.all([
            supabaseClient
                .from("student_lesson_balances")
                .select("paid_lessons, free_trial_used_at")
                .eq("student_id", studentId)
                .maybeSingle(),

            supabaseClient
                .from("lesson_bookings")
                .select(
                    "id, teacher_id, starts_at, ends_at, status, credit_source, meeting_url"
                )
                .eq("student_id", studentId)
                .order("starts_at", { ascending: true }),

            supabaseClient
                .from("lesson_credit_transactions")
                .select(
                    "transaction_type, lesson_delta, balance_after, created_at"
                )
                .eq("student_id", studentId)
                .order("created_at", { ascending: false })
                .limit(8)
        ]);

        if (balanceResult.error) {
            showDashboardError(
                "Lesson balance could not be loaded."
            );
            return false;
        }

        if (bookingsResult.error) {
            showDashboardError(
                "Your lessons could not be loaded."
            );
            return false;
        }

        if (transactionsResult.error) {
            showDashboardError(
                "Lesson balance history could not be loaded."
            );
            return false;
        }

        const balance = balanceResult.data;
        const bookings = bookingsResult.data || [];
        const transactions = transactionsResult.data || [];

        document.getElementById("paidLessonBalance").textContent =
            balance?.paid_lessons || 0;

        document.getElementById("freeTrialStatus").textContent =
            balance?.free_trial_used_at
                ? "Your free trial lesson has been used."
                : "You have one free trial lesson available.";

        let teacherNames;

        try {
            teacherNames = await loadTeacherNames(bookings);
        } catch (error) {
            showDashboardError(
                "Teacher information could not be loaded."
            );
            return false;
        }

        const upcomingBookings = bookings.filter((booking) => {
            return (
                booking.status === "scheduled" &&
                booking.starts_at >= nowIso
            );
        });

        const previousBookings = bookings
            .filter((booking) => {
                return !(
                    booking.status === "scheduled" &&
                    booking.starts_at >= nowIso
                );
            })
            .sort((firstBooking, secondBooking) => {
                return (
                    new Date(secondBooking.starts_at).getTime() -
                    new Date(firstBooking.starts_at).getTime()
                );
            });

        const nextLessonTitle = document.getElementById(
            "studentNextLessonTitle"
        );

        const nextLessonText = document.getElementById(
            "studentNextLessonText"
        );

        if (upcomingBookings.length) {
            const nextBooking = upcomingBookings[0];
            const nextTeacherName =
                teacherNames.get(nextBooking.teacher_id);

            nextLessonTitle.textContent = nextTeacherName
                ? `Lesson with ${nextTeacherName}`
                : "Your next lesson";

            nextLessonText.textContent =
                formatLessonDate(nextBooking.starts_at);
        } else {
            nextLessonTitle.textContent = "Your next lesson";
            nextLessonText.textContent =
                "No lessons booked yet. Choose a teacher and book an available time.";
        }

        renderLessonList(
            "upcomingLessonList",
            upcomingBookings,
            teacherNames,
            true
        );

        renderLessonList(
            "previousLessonList",
            previousBookings,
            teacherNames,
            false
        );

        renderLessonTransactions(transactions);

        return true;
    }

    async function loadDashboard() {
        const {
            data: userData,
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace("login.html#login");
            return;
        }

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("full_name, role, avatar_url")
            .eq("id", userData.user.id)
            .single();

        if (profileError || !profile) {
            showDashboardError(
                "Profile could not be loaded. Make sure the Supabase setup has been completed."
            );
            return;
        }

        if (profile.role !== expectedRole) {
            window.location.replace(
                roleDestination(profile.role)
            );
            return;
        }

        document.getElementById("userName").textContent =
            profile.full_name || "learner";

        document.getElementById("userEmail").textContent =
            userData.user.email || "";

        if (expectedRole === "teacher") {
            const {
                data: teacherProfile,
                error: teacherError
            } = await supabaseClient
                .from("teacher_profiles")
                .select("approval_status")
                .eq("user_id", userData.user.id)
                .single();

            if (teacherError || !teacherProfile) {
                showDashboardError(
                    "Teacher profile could not be loaded."
                );
                return;
            }

            const statusElement =
                document.getElementById("approvalStatus");

            const noticeElement =
                document.getElementById("approvalNotice");

            const status = teacherProfile.approval_status;

            statusElement.textContent = status;
            statusElement.className =
                `approval-status ${status}`;

            if (status === "approved") {
                noticeElement.textContent =
                    "Your teacher profile has been approved and can be published after you complete it.";

                noticeElement.classList.add("approved");
            } else if (status === "rejected") {
                noticeElement.textContent =
                    "Your teacher application needs changes. Contact Polyglot support for more information.";

                noticeElement.classList.add("rejected");
            }
        } else {
            const overviewLoaded =
                await loadStudentOverview(userData.user.id);

            if (!overviewLoaded) return;
        }

        dashboardMessage.hidden = true;
        dashboardContent.hidden = false;
    }

    document
        .getElementById("logoutButton")
        .addEventListener("click", async () => {
            const button =
                document.getElementById("logoutButton");

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