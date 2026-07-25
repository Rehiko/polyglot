(function () {
    "use strict";

    const form = document.getElementById("weeklyScheduleForm");
    const rowsContainer = document.getElementById("weeklyScheduleRows");
    const saveButton = document.getElementById("saveScheduleButton");

    const bookingsList = document.getElementById("teacherBookings");
    const studentsList = document.getElementById("teacherStudents");
    const historyList = document.getElementById("teacherLessonHistory");

    const nextLessonTitle = document.getElementById(
        "teacherNextLessonTitle"
    );

    const nextLessonText = document.getElementById(
        "teacherNextLessonText"
    );

    const studentCount = document.getElementById(
        "teacherStudentCount"
    );

    const studentSummary = document.getElementById(
        "teacherStudentSummary"
    );

    const message = document.getElementById("scheduleMessage");
    const durationHint = document.getElementById("lessonDurationHint");
    const timezoneBadge = document.getElementById("teacherTimezone");

    const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
    ];

    if (!form || !rowsContainer || !bookingsList) return;

    const url = window.POLYGLOT_SUPABASE_URL;
    const key = window.POLYGLOT_SUPABASE_KEY;

    const ready = Boolean(
        url &&
        key &&
        !url.includes("YOUR_SUPABASE") &&
        !key.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let teacherId = null;
    let lessonDuration = 60;
    let scheduleTimezone = browserTimezone;
    let approvalStatus = "pending";

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.className = `notice ${type}`;
        message.hidden = false;
    }

    function hideMessage() {
        message.hidden = true;
        message.textContent = "";
    }

    function formatDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(new Date(value));
    }

    function formatShortDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(new Date(value));
    }

    function formatTime(value) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function minutesFromTime(value) {
        const [hours, minutes] = value
            .split(":")
            .map(Number);

        return hours * 60 + minutes;
    }

    function pluralize(number, singular, plural) {
        return number === 1 ? singular : plural;
    }

    function getDisplayStatus(booking) {
        if (booking.booking_status === "cancelled") {
            return "Cancelled";
        }

        if (booking.booking_status === "completed") {
            return "Completed";
        }

        if (
            booking.booking_status === "scheduled" &&
            new Date(booking.ends_at).getTime() <= Date.now()
        ) {
            return "Completed";
        }

        return "Scheduled";
    }

    function getLessonType(booking) {
        return booking.credit_source === "free_trial"
            ? "Free trial lesson"
            : "Paid lesson";
    }

    function createDayRow(day, index, savedRule) {
        const row = document.createElement("div");
        row.className = "weekly-day-row";
        row.dataset.weekday = String(index + 1);

        const dayLabel = document.createElement("label");
        dayLabel.className = "weekly-day-toggle";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(savedRule);

        const switchMark = document.createElement("span");
        switchMark.className = "weekly-toggle-mark";

        const dayName = document.createElement("strong");
        dayName.textContent = day;

        dayLabel.append(
            checkbox,
            switchMark,
            dayName
        );

        const startInput = document.createElement("input");
        startInput.type = "time";
        startInput.className =
            "weekly-time-input start-time";

        startInput.value =
            savedRule?.start_time?.slice(0, 5) || "09:00";

        startInput.disabled = !savedRule;
        startInput.setAttribute(
            "aria-label",
            `${day} start time`
        );

        const endInput = document.createElement("input");
        endInput.type = "time";
        endInput.className =
            "weekly-time-input end-time";

        endInput.value =
            savedRule?.end_time?.slice(0, 5) || "17:00";

        endInput.disabled = !savedRule;
        endInput.setAttribute(
            "aria-label",
            `${day} end time`
        );

        checkbox.addEventListener("change", () => {
            startInput.disabled = !checkbox.checked;
            endInput.disabled = !checkbox.checked;

            row.classList.toggle(
                "enabled",
                checkbox.checked
            );
        });

        row.classList.toggle(
            "enabled",
            checkbox.checked
        );

        row.append(
            dayLabel,
            startInput,
            endInput
        );

        return row;
    }

    function renderScheduleRows(rules) {
        const savedByDay = new Map(
            (rules || []).map((rule) => [
                Number(rule.weekday),
                rule
            ])
        );

        rowsContainer.replaceChildren();

        days.forEach((day, index) => {
            rowsContainer.appendChild(
                createDayRow(
                    day,
                    index,
                    savedByDay.get(index + 1)
                )
            );
        });
    }

    async function cancelTeacherLesson(booking, button) {
    const confirmed = window.confirm(
        `Cancel the lesson with ${booking.student_name}?\n\n` +
        "The lesson will be returned to the student and this time will become available again."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Cancelling...";

    const { data, error } = await client.rpc(
        "teacher_cancel_lesson",
        {
            p_booking_id: booking.booking_id
        }
    );

    if (error) {
        button.disabled = false;
        button.textContent = "Cancel lesson";

        showMessage(
            error.message ||
            "The lesson could not be cancelled."
        );

        return;
    }

    const result = Array.isArray(data)
        ? data[0]
        : data;

    await loadBookings();

    showMessage(
        result?.result_message ||
        "Lesson cancelled. The lesson was returned to the student.",
        "success"
    );
}


function createUpcomingBookingElement(booking) {
    const item = document.createElement("article");

    item.className =
        "schedule-slot teacher-booking-item";

    const details = document.createElement("div");
    details.className = "schedule-slot-details";

    const studentName = document.createElement("strong");
    studentName.className = "teacher-booking-student";
    studentName.textContent = booking.student_name;

    const date = document.createElement("span");
    date.className = "teacher-booking-date";
    date.textContent = formatDate(booking.starts_at);

    const time = document.createElement("span");
    time.className = "schedule-slot-time";

    time.textContent =
        `${formatTime(booking.starts_at)}_at)}–` +
        formatTime(booking.ends_at);

    const lessonType = document.createElement("span");
    lessonType.className = "teacher-booking-type";
    lessonType.textContent = getLessonType(booking);

    details.append(
        studentName,
        date,
        time,
        lessonType
    );

    const actions = document.createElement("div");
    actions.className = "teacher-booking-actions";

    const status = document.createElement("span");
    status.className = "slot-status booked";
    status.textContent = "Scheduled";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className =
        "teacher-cancel-lesson-button";

    cancelButton.textContent = "Cancel lesson";

    cancelButton.addEventListener("click", () => {
        cancelTeacherLesson(
            booking,
            cancelButton
        );
    });

    actions.append(
        status,
        cancelButton
    );

    item.append(
        details,
        actions
    );

    return item;
}

    function createHistoryElement(booking) {
        const item = document.createElement("article");
        item.className =
            "dashboard-lesson-item teacher-history-item";

        const information = document.createElement("div");
        information.className =
            "dashboard-lesson-information";

        const topRow = document.createElement("div");
        topRow.className = "dashboard-lesson-top-row";

        const studentName = document.createElement("strong");
        studentName.className = "dashboard-lesson-teacher";
        studentName.textContent = booking.student_name;

        const displayStatus = getDisplayStatus(booking);

        const status = document.createElement("span");
        status.className =
            `lesson-status-badge ${displayStatus.toLowerCase()}`;

        status.textContent = displayStatus;

        topRow.append(studentName, status);

        const lessonDate = document.createElement("p");
        lessonDate.className = "dashboard-lesson-date";

        lessonDate.textContent =
            `${formatDate(booking.starts_at)} at ` +
            formatTime(booking.starts_at);

        const details = document.createElement("p");
        details.className = "dashboard-lesson-details";

        details.textContent =
            `${getLessonType(booking)} · Ends at ` +
            formatTime(booking.ends_at);

        information.append(
            topRow,
            lessonDate,
            details
        );

        item.appendChild(information);

        return item;
    }

    function renderUpcomingBookings(bookings) {
        bookingsList.replaceChildren();

        if (!bookings.length) {
            const empty = document.createElement("p");
            empty.className = "empty-slots-message";

            empty.textContent =
                "You do not have any upcoming booked lessons yet.";

            bookingsList.appendChild(empty);
            return;
        }

        bookings.forEach((booking) => {
            bookingsList.appendChild(
                createUpcomingBookingElement(booking)
            );
        });
    }

    function renderLessonHistory(bookings) {
        if (!historyList) return;

        historyList.replaceChildren();

        if (!bookings.length) {
            const empty = document.createElement("p");
            empty.className = "empty-transactions";

            empty.textContent =
                "Completed and cancelled lessons will appear here.";

            historyList.appendChild(empty);
            return;
        }

        bookings.forEach((booking) => {
            historyList.appendChild(
                createHistoryElement(booking)
            );
        });
    }

    function getStudentInitial(name) {
        return (name || "S")
            .trim()
            .charAt(0)
            .toUpperCase();
    }

    function createStudentElement(
        student,
        allBookings
    ) {
        const studentBookings = allBookings.filter(
            (booking) =>
                booking.student_id === student.student_id
        );

        const upcomingBookings = studentBookings
            .filter((booking) => {
                return (
                    booking.booking_status === "scheduled" &&
                    new Date(booking.ends_at).getTime() >
                        Date.now()
                );
            })
            .sort((firstBooking, secondBooking) => {
                return (
                    new Date(firstBooking.starts_at).getTime() -
                    new Date(secondBooking.starts_at).getTime()
                );
            });

        const item = document.createElement("article");
        item.className = "teacher-student-item";

        const avatar = document.createElement("div");
        avatar.className = "teacher-student-avatar";
        avatar.textContent =
            getStudentInitial(student.student_name);

        const information = document.createElement("div");
        information.className =
            "teacher-student-information";

        const name = document.createElement("strong");
        name.textContent = student.student_name;

        const bookingCount = document.createElement("span");

        bookingCount.textContent =
            `${studentBookings.length} ` +
            pluralize(
                studentBookings.length,
                "lesson",
                "lessons"
            ) +
            ` · ${upcomingBookings.length} upcoming`;

        information.append(name, bookingCount);

        const nextLesson = document.createElement("span");
        nextLesson.className =
            "teacher-student-next-lesson";

        if (upcomingBookings.length) {
            nextLesson.textContent =
                `Next: ${formatShortDate(
                    upcomingBookings[0].starts_at
                )}, ${formatTime(
                    upcomingBookings[0].starts_at
                )}`;
        } else {
            nextLesson.textContent =
                "No upcoming lessons";
        }

        item.append(
            avatar,
            information,
            nextLesson
        );

        return item;
    }

    function renderStudents(bookings) {
        if (!studentsList) return;

        studentsList.replaceChildren();

        const uniqueStudents = new Map();

        bookings.forEach((booking) => {
            if (!uniqueStudents.has(booking.student_id)) {
                uniqueStudents.set(
                    booking.student_id,
                    {
                        student_id: booking.student_id,
                        student_name: booking.student_name
                    }
                );
            }
        });

        const students = [...uniqueStudents.values()]
            .sort((firstStudent, secondStudent) => {
                return firstStudent.student_name.localeCompare(
                    secondStudent.student_name
                );
            });

        const upcomingCount = bookings.filter(
            (booking) =>
                booking.booking_status === "scheduled" &&
                new Date(booking.ends_at).getTime() >
                    Date.now()
        ).length;

        if (studentCount) {
            studentCount.textContent =
                `${students.length} ` +
                pluralize(
                    students.length,
                    "student",
                    "students"
                );
        }

        if (studentSummary) {
            studentSummary.textContent = students.length
                ? `${upcomingCount} upcoming ${pluralize(
                    upcomingCount,
                    "lesson",
                    "lessons"
                )} across all students.`
                : "Students with booked lessons will appear here.";
        }

        if (!students.length) {
            const empty = document.createElement("p");
            empty.className = "empty-slots-message";

            empty.textContent =
                "You do not have any booked students yet.";

            studentsList.appendChild(empty);
            return;
        }

        students.forEach((student) => {
            studentsList.appendChild(
                createStudentElement(
                    student,
                    bookings
                )
            );
        });
    }

    function renderNextLesson(upcomingBookings) {
        if (!nextLessonTitle || !nextLessonText) return;

        if (!upcomingBookings.length) {
            nextLessonTitle.textContent =
                "Your next lesson";

            nextLessonText.textContent =
                "You do not have any upcoming lessons yet.";

            return;
        }

        const nextBooking = upcomingBookings[0];

        nextLessonTitle.textContent =
            `Lesson with ${nextBooking.student_name}`;

        nextLessonText.textContent =
            `${formatDate(nextBooking.starts_at)} · ` +
            `${formatTime(nextBooking.starts_at)}–` +
            formatTime(nextBooking.ends_at);
    }

    function renderTeacherDashboard(bookings) {
        const currentTime = Date.now();

        const upcomingBookings = bookings
            .filter((booking) => {
                return (
                    booking.booking_status === "scheduled" &&
                    new Date(booking.ends_at).getTime() >
                        currentTime
                );
            })
            .sort((firstBooking, secondBooking) => {
                return (
                    new Date(firstBooking.starts_at).getTime() -
                    new Date(secondBooking.starts_at).getTime()
                );
            });

        const previousBookings = bookings
            .filter((booking) => {
                return !(
                    booking.booking_status === "scheduled" &&
                    new Date(booking.ends_at).getTime() >
                        currentTime
                );
            })
            .sort((firstBooking, secondBooking) => {
                return (
                    new Date(secondBooking.starts_at).getTime() -
                    new Date(firstBooking.starts_at).getTime()
                );
            });

        renderNextLesson(upcomingBookings);
        renderUpcomingBookings(upcomingBookings);
        renderStudents(bookings);
        renderLessonHistory(previousBookings);
    }

    async function loadBookings() {
        const { data, error } = await client.rpc(
            "get_teacher_lesson_dashboard"
        );

        if (error) {
            showMessage(
                `Bookings could not be loaded: ${error.message}`
            );

            return;
        }

        renderTeacherDashboard(data || []);
    }

    async function initializeSchedule() {
        if (window.location.hash === "#availability") {
            document
                .getElementById("nextLessonCard")
                ?.classList.remove("accent-card");

            document
                .getElementById("scheduleStepCard")
                ?.classList.add("accent-card");
        }

        const {
            data: userData,
            error: userError
        } = await client.auth.getUser();

        if (userError || !userData.user) return;

        teacherId = userData.user.id;

        const [
            {
                data: teacher,
                error: teacherError
            },
            {
                data: rules,
                error: rulesError
            }
        ] = await Promise.all([
            client
                .from("teacher_profiles")
                .select(
                    "approval_status, lesson_duration_minutes, timezone"
                )
                .eq("user_id", teacherId)
                .single(),

            client
                .from("teacher_weekly_availability")
                .select(
                    "weekday, start_time, end_time"
                )
                .eq("teacher_id", teacherId)
                .order("weekday", {
                    ascending: true
                })
        ]);

        if (
            teacherError ||
            rulesError ||
            !teacher
        ) {
            showMessage(
                "Weekly schedule could not be initialized. Run the newest Supabase setup."
            );

            return;
        }

        lessonDuration =
            teacher.lesson_duration_minutes || 60;

        approvalStatus =
            teacher.approval_status;

        scheduleTimezone = rules?.length
            ? teacher.timezone || browserTimezone
            : browserTimezone;

        timezoneBadge.textContent =
            scheduleTimezone;

        durationHint.textContent =
            `The system will divide each working period into ` +
            `${lessonDuration}-minute lesson times.`;

        renderScheduleRows(rules || []);

        await loadBookings();
    }

    form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();
            hideMessage();

            const selectedRows = [
                ...rowsContainer.querySelectorAll(
                    ".weekly-day-row"
                )
            ].filter((row) => {
                return row
                    .querySelector(
                        "input[type='checkbox']"
                    )
                    .checked;
            });

            if (!selectedRows.length) {
                showMessage(
                    "Enable at least one working day."
                );

                return;
            }

            const rules = [];

            for (const row of selectedRows) {
                const startTime =
                    row.querySelector(
                        ".start-time"
                    ).value;

                const endTime =
                    row.querySelector(
                        ".end-time"
                    ).value;

                if (
                    !startTime ||
                    !endTime ||
                    minutesFromTime(endTime) <=
                        minutesFromTime(startTime)
                ) {
                    showMessage(
                        "For every enabled day, the end time must be later than the start time."
                    );

                    return;
                }

                if (
                    minutesFromTime(endTime) -
                        minutesFromTime(startTime) <
                    lessonDuration
                ) {
                    showMessage(
                        `Every working period must fit at least one ` +
                        `${lessonDuration}-minute lesson.`
                    );

                    return;
                }

                rules.push({
                    weekday: Number(row.dataset.weekday),
                    start_time: startTime,
                    end_time: endTime
                });
            }

            saveButton.disabled = true;

            saveButton
                .querySelector("span:first-child")
                .textContent = "Saving...";

            const { error } = await client.rpc(
                "save_teacher_weekly_schedule",
                {
                    p_rules: rules,
                    p_timezone: scheduleTimezone
                }
            );

            saveButton.disabled = false;

            saveButton
                .querySelector("span:first-child")
                .textContent =
                    "Save weekly schedule";

            if (error) {
                showMessage(error.message);
                return;
            }

            const approvalNote =
                approvalStatus === "approved"
                    ? "Students can now see and book these hours."
                    : "The hours will become public after your teacher profile is approved.";

            showMessage(
                `Your weekly schedule has been saved. ${approvalNote}`,
                "success"
            );

            await loadBookings();
        }
    );

    if (!ready) {
        showMessage(
            "Add your Supabase URL and publishable key to supabase-config.js."
        );

        form.hidden = true;
        return;
    }

    client = window.supabase.createClient(
        url,
        key
    );

    initializeSchedule();
})();