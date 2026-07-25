(function () {
    "use strict";

    const adminMessage = document.getElementById("adminMessage");
    const adminContent = document.getElementById("adminContent");

    const teacherList = document.getElementById("adminTeacherList");
    const userList = document.getElementById("adminUserList");
    const paymentList = document.getElementById("adminPaymentList");
    const bookingList = document.getElementById("adminBookingList");

    const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
    const supabaseKey = window.POLYGLOT_SUPABASE_KEY;

    const configIsReady = Boolean(
        supabaseUrl &&
        supabaseKey &&
        !supabaseUrl.includes("YOUR_SUPABASE") &&
        !supabaseKey.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let currentAdminId = null;

    function showAdminError(text) {
        adminMessage.textContent = text;
        adminMessage.className = "notice error";
        adminMessage.hidden = false;
    }

    function showAdminNotice(text) {
        adminMessage.textContent = text;
        adminMessage.className = "notice success";
        adminMessage.hidden = false;

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    function formatDate(value) {
        if (!value) return "—";

        return new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function capitalize(value) {
        if (!value) return "Unknown";

        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function createStatusBadge(status) {
        const badge = document.createElement("span");

        const normalizedStatus =
            String(status || "unknown").toLowerCase();

        badge.className =
            `admin-status-badge ${normalizedStatus}`;

        badge.textContent = capitalize(normalizedStatus);

        return badge;
    }

    function createEmptyMessage(text) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-message";
        empty.textContent = text;

        return empty;
    }

    function createTable(headers, rows) {
        const table = document.createElement("table");
        table.className = "admin-table";

        const tableHead = document.createElement("thead");
        const headingRow = document.createElement("tr");

        headers.forEach((header) => {
            const heading = document.createElement("th");
            heading.textContent = header;
            headingRow.appendChild(heading);
        });

        tableHead.appendChild(headingRow);

        const tableBody = document.createElement("tbody");

        rows.forEach((row) => {
            const tableRow = document.createElement("tr");

            row.forEach((cellValue) => {
                const cell = document.createElement("td");

                if (cellValue instanceof HTMLElement) {
                    cell.appendChild(cellValue);
                } else {
                    cell.textContent =
                        cellValue === null ||
                        cellValue === undefined ||
                        cellValue === ""
                            ? "—"
                            : String(cellValue);
                }

                tableRow.appendChild(cell);
            });

            tableBody.appendChild(tableRow);
        });

        table.append(tableHead, tableBody);

        return table;
    }

    function renderStats(stats) {
        document.getElementById("adminStudentCount").textContent =
            stats?.students || 0;

        document.getElementById("adminTeacherCount").textContent =
            stats?.teachers || 0;

        document.getElementById("adminPendingCount").textContent =
            stats?.pendingTeachers || 0;

        document.getElementById("adminPaymentCount").textContent =
            stats?.payments || 0;

        document.getElementById("adminBookingCount").textContent =
            stats?.bookings || 0;
    }

    async function updateTeacherApproval(
        teacher,
        newStatus,
        button
    ) {
        const action =
            newStatus === "approved"
                ? "approve"
                : "reject";

        const confirmed = window.confirm(
            `${capitalize(action)} ${teacher.fullName}?`
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Updating...";

        const { error } = await client.rpc(
            "admin_set_teacher_approval",
            {
                p_teacher_id: teacher.userId,
                p_status: newStatus
            }
        );

        if (error) {
            button.disabled = false;
            button.textContent = capitalize(action);

            showAdminError(
                error.message ||
                "Teacher status could not be updated."
            );

            return;
        }

        await loadAdminData(false);

        showAdminNotice(
            `${teacher.fullName} is now ${newStatus}.`
        );
    }

    function createTeacherItem(teacher) {
        const item = document.createElement("article");
        item.className = "admin-teacher-item";

        const information = document.createElement("div");
        information.className = "admin-teacher-information";

        const nameRow = document.createElement("div");
        nameRow.className = "admin-teacher-name-row";

        const name = document.createElement("strong");
        name.textContent =
            teacher.fullName || "Unnamed teacher";

        nameRow.append(
            name,
            createStatusBadge(teacher.approvalStatus)
        );

        const email = document.createElement("span");
        email.textContent = teacher.email || "No email";

        information.append(nameRow, email);

        const actions = document.createElement("div");
        actions.className = "admin-teacher-actions";

        const approveButton = document.createElement("button");
        approveButton.type = "button";
        approveButton.className =
            "admin-action-button approve";

        approveButton.textContent =
            teacher.approvalStatus === "approved"
                ? "Approved"
                : "Approve";

        approveButton.disabled =
            teacher.approvalStatus === "approved";

        approveButton.addEventListener("click", () => {
            updateTeacherApproval(
                teacher,
                "approved",
                approveButton
            );
        });

        const rejectButton = document.createElement("button");
        rejectButton.type = "button";
        rejectButton.className =
            "admin-action-button reject";

        rejectButton.textContent =
            teacher.approvalStatus === "rejected"
                ? "Rejected"
                : "Reject";

        rejectButton.disabled =
            teacher.approvalStatus === "rejected";

        rejectButton.addEventListener("click", () => {
            updateTeacherApproval(
                teacher,
                "rejected",
                rejectButton
            );
        });

        actions.append(
            approveButton,
            rejectButton
        );

        item.append(
            information,
            actions
        );

        return item;
    }

    function renderTeachers(teachers) {
        teacherList.replaceChildren();

        if (!teachers?.length) {
            teacherList.appendChild(
                createEmptyMessage(
                    "No teacher applications found."
                )
            );

            return;
        }

        teachers.forEach((teacher) => {
            teacherList.appendChild(
                createTeacherItem(teacher)
            );
        });
    }

    function renderUsers(users) {
        userList.replaceChildren();

        if (!users?.length) {
            userList.appendChild(
                createEmptyMessage(
                    "No registered accounts found."
                )
            );

            return;
        }

        const rows = users.map((user) => {
            const displayedRole =
                user.userId === currentAdminId
                    ? "admin"
                    : user.role;

            return [
                user.fullName || "Unnamed user",
                user.email || "—",
                createStatusBadge(displayedRole),
                formatDate(user.createdAt)
            ];
        });

        userList.appendChild(
            createTable(
                [
                    "Name",
                    "Email",
                    "Role",
                    "Registered"
                ],
                rows
            )
        );
    }

    function formatPackage(packageId) {
        const lessons = String(packageId || "")
            .replace("package_", "");

        if (!lessons) return "Unknown package";

        return `${lessons}-lesson package`;
    }

    function renderPayments(payments) {
        paymentList.replaceChildren();

        if (!payments?.length) {
            paymentList.appendChild(
                createEmptyMessage(
                    "No confirmed payments found."
                )
            );

            return;
        }

        const rows = payments.map((payment) => {
            const orderCode = document.createElement("code");
            orderCode.className = "admin-code";
            orderCode.textContent =
                payment.paypalOrderId || "—";

            return [
                payment.studentName || "Unknown student",
                formatPackage(payment.packageId),
                payment.lessons || 0,
                orderCode
            ];
        });

        paymentList.appendChild(
            createTable(
                [
                    "Student",
                    "Package",
                    "Lessons",
                    "PayPal order"
                ],
                rows
            )
        );
    }

    function bookingDisplayStatus(booking) {
        if (
            booking.status === "scheduled" &&
            new Date(booking.endsAt).getTime() <= Date.now()
        ) {
            return "completed";
        }

        return booking.status || "unknown";
    }

    function renderBookings(bookings) {
        bookingList.replaceChildren();

        if (!bookings?.length) {
            bookingList.appendChild(
                createEmptyMessage(
                    "No lesson bookings found."
                )
            );

            return;
        }

        const rows = bookings.map((booking) => {
            const lessonType =
                booking.creditSource === "free_trial"
                    ? "Free trial"
                    : "Paid lesson";

            return [
                booking.studentName || "Unknown student",
                booking.teacherName || "Unknown teacher",
                formatDate(booking.startsAt),
                lessonType,
                createStatusBadge(
                    bookingDisplayStatus(booking)
                )
            ];
        });

        bookingList.appendChild(
            createTable(
                [
                    "Student",
                    "Teacher",
                    "Lesson time",
                    "Type",
                    "Status"
                ],
                rows
            )
        );
    }

    async function loadAdminData(showLoading = true) {
        if (showLoading) {
            adminMessage.textContent =
                "Loading administrator dashboard...";

            adminMessage.className = "notice warning";
            adminMessage.hidden = false;
        }

        const { data, error } = await client.rpc(
            "get_admin_dashboard"
        );

        if (error) {
            showAdminError(
                error.message ||
                "Administrator data could not be loaded."
            );

            return false;
        }

        renderStats(data?.stats || {});
        renderTeachers(data?.teachers || []);
        renderUsers(data?.users || []);
        renderPayments(data?.payments || []);
        renderBookings(data?.bookings || []);

        adminMessage.hidden = true;
        adminContent.hidden = false;

        return true;
    }

    async function initializeAdminDashboard() {
        const {
            data: userData,
            error: userError
        } = await client.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace("login.html#login");
            return;
        }

        currentAdminId = userData.user.id;

        const {
            data: isAdmin,
            error: adminError
        } = await client.rpc(
            "is_current_user_admin"
        );

        if (adminError || !isAdmin) {
            showAdminError(
                "This account does not have administrator access."
            );

            return;
        }

        const {
            data: profile,
            error: profileError
        } = await client
            .from("profiles")
            .select("full_name")
            .eq("id", currentAdminId)
            .maybeSingle();

        if (profileError) {
            showAdminError(
                "Administrator profile could not be loaded."
            );

            return;
        }

        document.getElementById("adminName").textContent =
            profile?.full_name || "administrator";

        document.getElementById("adminEmail").textContent =
            userData.user.email || "";

        await loadAdminData();
    }

    document
        .getElementById("logoutButton")
        .addEventListener("click", async () => {
            const button =
                document.getElementById("logoutButton");

            button.disabled = true;
            button.textContent = "Logging out...";

            await client.auth.signOut();

            window.location.replace("login.html#login");
        });

    if (!configIsReady) {
        showAdminError(
            "Add your Supabase URL and publishable key to supabase-config.js."
        );

        return;
    }

    client = window.supabase.createClient(
        supabaseUrl,
        supabaseKey
    );

    client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            window.location.replace("login.html#login");
        }
    });

    initializeAdminDashboard();
})();