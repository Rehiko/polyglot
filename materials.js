(function () {
    "use strict";

    const pageMessage = document.getElementById("materialsMessage");
    const pageContent = document.getElementById("materialsContent");

    const dashboardLink =
        document.getElementById("materialsDashboardLink");
    const teachersLink =
        document.getElementById("materialsTeachersLink");

    const teacherMaterialComposer =
        document.getElementById("teacherMaterialComposer");
    const teacherHomeworkComposer =
        document.getElementById("teacherHomeworkComposer");

    const materialForm = document.getElementById("materialForm");
    const materialTitle = document.getElementById("materialTitle");
    const materialDescription =
        document.getElementById("materialDescription");
    const materialStudent =
        document.getElementById("materialStudent");
    const materialType = document.getElementById("materialType");
    const materialFile = document.getElementById("materialFile");
    const materialFileSelection =
        document.getElementById("materialFileSelection");
    const materialLink = document.getElementById("materialLink");
    const materialFileField =
        document.getElementById("materialFileField");
    const materialLinkField =
        document.getElementById("materialLinkField");
    const materialFormMessage =
        document.getElementById("materialFormMessage");
    const saveMaterialButton =
        document.getElementById("saveMaterialButton");
    const materialsList = document.getElementById("materialsList");
    const materialsCount = document.getElementById("materialsCount");

    const homeworkForm = document.getElementById("homeworkForm");
    const homeworkStudent =
        document.getElementById("homeworkStudent");
    const homeworkTitle = document.getElementById("homeworkTitle");
    const homeworkDueAt = document.getElementById("homeworkDueAt");
    const homeworkFile = document.getElementById("homeworkFile");
    const homeworkInstructions =
        document.getElementById("homeworkInstructions");
    const homeworkFormMessage =
        document.getElementById("homeworkFormMessage");
    const saveHomeworkButton =
        document.getElementById("saveHomeworkButton");
    const homeworkList = document.getElementById("homeworkList");
    const homeworkCount = document.getElementById("homeworkCount");

    const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
    const supabaseKey = window.POLYGLOT_SUPABASE_KEY;

    const configIsReady = Boolean(
        supabaseUrl &&
        supabaseKey &&
        !supabaseUrl.includes("YOUR_SUPABASE") &&
        !supabaseKey.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    const maximumFileSize = 25 * 1024 * 1024;
    const maximumMaterialFiles = 10;
    const allowedFileTypes = new Map([
        ["jpg", "image/jpeg"],
        ["jpeg", "image/jpeg"],
        ["png", "image/png"],
        ["webp", "image/webp"],
        ["gif", "image/gif"],
        ["pdf", "application/pdf"],
        ["doc", "application/msword"],
        [
            "docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ],
        ["ppt", "application/vnd.ms-powerpoint"],
        [
            "pptx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ],
        ["txt", "text/plain"],
        ["mp3", "audio/mpeg"],
        ["wav", "audio/wav"],
        ["ogg", "audio/ogg"]
    ]);

    let client = null;
    let currentUser = null;
    let currentProfile = null;
    let teacherStudents = [];
    let learningMaterials = [];
    let homeworkAssignments = [];
    let homeworkSubmissions = new Map();
    let profileNames = new Map();
    let selectedMaterialFiles = [];

    function showPageError(text) {
        pageMessage.textContent = text;
        pageMessage.className = "notice error";
        pageMessage.hidden = false;
    }

    function showPageNotice(text) {
        pageMessage.textContent = text;
        pageMessage.className = "notice success";
        pageMessage.hidden = false;
    }

    function hidePageMessage() {
        pageMessage.hidden = true;
    }

    function showInlineMessage(element, text, isError = false) {
        element.textContent = text;
        element.className = isError
            ? "materials-inline-message error"
            : "materials-inline-message";
        element.hidden = false;
    }

    function hideInlineMessage(element) {
        element.textContent = "";
        element.hidden = true;
    }

    function setButtonLoading(button, loadingText, isLoading) {
        button.disabled = isLoading;

        const label = button.querySelector("span:first-child");

        if (!label.dataset.originalText) {
            label.dataset.originalText = label.textContent;
        }

        label.textContent = isLoading
            ? loadingText
            : label.dataset.originalText;
    }

    function fileExtension(fileName) {
        return (fileName.split(".").pop() || "")
            .trim()
            .toLowerCase();
    }

    function validateFile(file) {
        if (!file) return "Choose a file first.";

        if (!allowedFileTypes.has(fileExtension(file.name))) {
            return "This file type is not supported.";
        }

        if (file.size > maximumFileSize) {
            return "The selected file is larger than 25 MB.";
        }

        return "";
    }

    function validateMaterialFiles(files) {
        if (!files.length) return "Choose at least one file.";

        if (files.length > maximumMaterialFiles) {
            return `Choose no more than ${maximumMaterialFiles} files at once.`;
        }

        for (const file of files) {
            const error = validateFile(file);

            if (error) {
                return `${file.name}: ${error}`;
            }
        }

        return "";
    }

    function materialFileKey(file) {
        return [
            file.name,
            file.size,
            file.lastModified
        ].join(":");
    }

    function renderSelectedMaterialFiles() {
        materialFileSelection.replaceChildren();
        materialFileSelection.hidden =
            selectedMaterialFiles.length === 0;

        if (!selectedMaterialFiles.length) return;

        const heading = document.createElement("div");
        heading.className = "material-file-selection-heading";

        const title = document.createElement("span");
        title.textContent = "Selected files";

        const count = document.createElement("span");
        count.textContent =
            `${selectedMaterialFiles.length}/${maximumMaterialFiles}`;

        heading.append(title, count);
        materialFileSelection.appendChild(heading);

        selectedMaterialFiles.forEach((file) => {
            const row = document.createElement("div");
            row.className = "selected-material-file";

            const name = document.createElement("span");
            name.textContent = file.name;
            name.title = file.name;

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => {
                const key = materialFileKey(file);
                selectedMaterialFiles =
                    selectedMaterialFiles.filter(
                        (selectedFile) =>
                            materialFileKey(selectedFile) !== key
                    );
                renderSelectedMaterialFiles();
            });

            row.append(name, removeButton);
            materialFileSelection.appendChild(row);
        });
    }

    function addSelectedMaterialFiles(files) {
        hideInlineMessage(materialFormMessage);

        const knownKeys = new Set(
            selectedMaterialFiles.map(materialFileKey)
        );

        for (const file of files) {
            const fileError = validateFile(file);

            if (fileError) {
                showInlineMessage(
                    materialFormMessage,
                    `${file.name}: ${fileError}`,
                    true
                );
                continue;
            }

            const key = materialFileKey(file);
            if (knownKeys.has(key)) continue;

            if (
                selectedMaterialFiles.length >=
                maximumMaterialFiles
            ) {
                showInlineMessage(
                    materialFormMessage,
                    `You can attach no more than ${maximumMaterialFiles} files.`,
                    true
                );
                break;
            }

            selectedMaterialFiles.push(file);
            knownKeys.add(key);
        }

        renderSelectedMaterialFiles();
    }

    function safeStorageFileName(fileName) {
        const cleaned = fileName
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}._-]+/gu, "_")
            .replace(/^[_\-.]+/, "")
            .slice(-140);

        return cleaned || "course-file";
    }

    function isSafeExternalUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === "https:" || url.protocol === "http:";
        } catch {
            return false;
        }
    }

    function formatDate(value, includeTime = false) {
        if (!value) return "";

        const options = {
            day: "numeric",
            month: "short",
            year: "numeric"
        };

        if (includeTime) {
            options.hour = "2-digit";
            options.minute = "2-digit";
        }

        return new Intl.DateTimeFormat(undefined, options).format(
            new Date(value)
        );
    }

    function plural(count, singular, pluralWord) {
        return `${count} ${count === 1 ? singular : pluralWord}`;
    }

    async function uploadCourseFile(folder, file) {
        const extension = fileExtension(file.name);
        const path = [
            folder,
            currentUser.id,
            `${crypto.randomUUID()}-${safeStorageFileName(file.name)}`
        ].join("/");

        const { error } = await client.storage
            .from("course-files")
            .upload(path, file, {
                cacheControl: "3600",
                contentType: allowedFileTypes.get(extension),
                upsert: false
            });

        if (error) {
            throw error;
        }

        return path;
    }

    async function removeCourseFile(path) {
        if (!path) return;

        const { error } = await client.storage
            .from("course-files")
            .remove([path]);

        if (error) {
            console.error("Course file cleanup failed:", error.message);
        }
    }

    async function sendChatNotification(
        teacherId,
        studentId,
        text
    ) {
        const {
            data: conversation,
            error: conversationError
        } = await client
            .from("lesson_conversations")
            .select("id")
            .eq("teacher_id", teacherId)
            .eq("student_id", studentId)
            .maybeSingle();

        if (conversationError || !conversation) {
            if (conversationError) {
                console.error(
                    "Chat notification conversation lookup failed:",
                    conversationError.message
                );
            }
            return;
        }

        const { error } = await client
            .from("conversation_messages")
            .insert({
                conversation_id: conversation.id,
                sender_id: currentUser.id,
                message_type: "system",
                message_text: text
            });

        if (error) {
            console.error(
                "Chat notification could not be sent:",
                error.message
            );
        }
    }

    async function notifyMaterialAudience(studentId, title) {
        const recipientIds = studentId
            ? [studentId]
            : teacherStudents.map((student) => student.student_id);

        await Promise.all(
            [...new Set(recipientIds)].map((recipientId) =>
                sendChatNotification(
                    currentUser.id,
                    recipientId,
                    `New learning material: ${title}. Open Materials to view it.`
                )
            )
        );
    }

    async function downloadCourseFile(path, fileName, button) {
        if (!path) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Downloading...";

        const { data, error } = await client.storage
            .from("course-files")
            .download(path);

        button.disabled = false;
        button.textContent = originalText;

        if (error || !data) {
            showPageError(
                `The file could not be downloaded: ${
                    error?.message || "Unknown error"
                }`
            );
            return;
        }

        const objectUrl = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName || "course-file";
        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 1000);
    }

    function createDownloadButton(path, fileName, label = "Download") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "material-open-button";
        button.textContent = label;
        button.addEventListener("click", () => {
            downloadCourseFile(path, fileName, button);
        });
        return button;
    }

    function getMaterialFiles(material) {
        const relatedFiles = Array.isArray(
            material.learning_material_files
        )
            ? material.learning_material_files
            : [];

        const files = relatedFiles
            .filter((file) => file.file_path && file.file_name)
            .map((file) => ({
                id: file.id,
                file_path: file.file_path,
                file_name: file.file_name
            }));

        if (
            material.material_type === "file" &&
            material.file_path &&
            material.file_name &&
            !files.some(
                (file) => file.file_path === material.file_path
            )
        ) {
            files.unshift({
                id: null,
                file_path: material.file_path,
                file_name: material.file_name
            });
        }

        return files;
    }

    function createMaterialFileList(material) {
        const list = document.createElement("div");
        list.className = "material-file-list";

        getMaterialFiles(material).forEach((file) => {
            const row = document.createElement("div");
            row.className = "material-file-row";

            const name = document.createElement("span");
            name.className = "material-file-name";
            name.textContent = file.file_name;
            name.title = file.file_name;

            const downloadButton = createDownloadButton(
                file.file_path,
                file.file_name
            );

            row.append(name, downloadButton);
            list.appendChild(row);
        });

        return list;
    }

    function createEmptyState(text) {
        const empty = document.createElement("p");
        empty.className = "materials-empty";
        empty.textContent = text;
        return empty;
    }

    function studentName(studentId) {
        return (
            teacherStudents.find(
                (student) => student.student_id === studentId
            )?.student_name ||
            profileNames.get(studentId) ||
            "Polyglot student"
        );
    }

    function teacherName(teacherId) {
        return (
            profileNames.get(teacherId) ||
            (teacherId === currentUser.id
                ? currentProfile.full_name
                : "Polyglot teacher")
        );
    }

    async function loadProfileNames(ids) {
        const missingIds = [
            ...new Set(ids.filter(Boolean))
        ].filter((id) => !profileNames.has(id));

        if (!missingIds.length) return;

        const { data, error } = await client
            .from("profiles")
            .select("id, full_name")
            .in("id", missingIds);

        if (error) {
            console.error("Profile names could not be loaded:", error.message);
            return;
        }

        (data || []).forEach((profile) => {
            profileNames.set(profile.id, profile.full_name);
        });
    }

    function populateStudentSelects() {
        teacherStudents.forEach((student) => {
            const materialOption = document.createElement("option");
            materialOption.value = student.student_id;
            materialOption.textContent = student.student_name;
            materialStudent.appendChild(materialOption);

            const homeworkOption = document.createElement("option");
            homeworkOption.value = student.student_id;
            homeworkOption.textContent = student.student_name;
            homeworkStudent.appendChild(homeworkOption);
        });
    }

    async function loadTeacherStudents() {
        if (currentProfile.role !== "teacher") return true;

        const { data, error } = await client.rpc(
            "get_my_material_students"
        );

        if (error) {
            showPageError(
                `Students could not be loaded: ${error.message}`
            );
            return false;
        }

        teacherStudents = data || [];
        populateStudentSelects();
        return true;
    }

    function materialAudience(material) {
        if (currentProfile.role === "student") {
            return teacherName(material.teacher_id);
        }

        return material.audience_student_id
            ? studentName(material.audience_student_id)
            : "All my students";
    }

    function createMaterialCard(material) {
        const card = document.createElement("article");
        card.className = "materials-card";

        const icon = document.createElement("span");
        icon.className = "materials-card-icon";
        icon.textContent = material.material_type === "file" ? "↓" : "↗";
        icon.setAttribute("aria-hidden", "true");

        const body = document.createElement("div");
        body.className = "materials-card-body";

        const top = document.createElement("div");
        top.className = "materials-card-top";

        const title = document.createElement("h3");
        title.textContent = material.title;

        const audience = document.createElement("span");
        audience.className = "audience-badge";
        audience.textContent = materialAudience(material);

        top.append(title, audience);

        if (material.description) {
            const description = document.createElement("p");
            description.textContent = material.description;
            body.append(top, description);
        } else {
            body.appendChild(top);
        }

        const meta = document.createElement("div");
        meta.className = "materials-card-meta";

        if (currentProfile.role === "student") {
            const sharedBy = document.createElement("span");
            sharedBy.textContent =
                `Shared by ${teacherName(material.teacher_id)}`;
            meta.appendChild(sharedBy);
        }

        const source = document.createElement("span");
        const files = getMaterialFiles(material);
        source.textContent =
            material.material_type === "file"
                ? plural(files.length, "file", "files")
                : "External resource";

        const date = document.createElement("span");
        date.textContent = formatDate(material.created_at);
        meta.append(source, date);
        body.appendChild(meta);

        if (material.material_type === "file") {
            body.appendChild(createMaterialFileList(material));
        }

        const actions = document.createElement("div");
        actions.className = "materials-card-actions";

        if (
            material.material_type === "link" &&
            isSafeExternalUrl(material.external_url)
        ) {
            const openLink = document.createElement("a");
            openLink.className = "material-open-button";
            openLink.href = material.external_url;
            openLink.target = "_blank";
            openLink.rel = "noopener noreferrer";
            openLink.textContent = "Open link";
            actions.appendChild(openLink);
        }

        if (currentProfile.role === "teacher") {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "material-delete-button";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => {
                deleteMaterial(material, deleteButton);
            });
            actions.appendChild(deleteButton);
        }

        card.append(icon, body, actions);
        return card;
    }

    function renderMaterials() {
        materialsList.replaceChildren();
        materialsCount.textContent = plural(
            learningMaterials.length,
            "material",
            "materials"
        );

        if (!learningMaterials.length) {
            materialsList.appendChild(
                createEmptyState(
                    currentProfile.role === "teacher"
                        ? "Share your first textbook, worksheet, audio file, presentation, or link."
                        : "Your teachers have not shared any learning materials yet."
                )
            );
            return;
        }

        learningMaterials.forEach((material) => {
            materialsList.appendChild(createMaterialCard(material));
        });
    }

    async function loadMaterials() {
        const { data, error } = await client
            .from("learning_materials")
            .select(
                "id, teacher_id, audience_student_id, title, description, material_type, file_path, file_name, external_url, created_at, learning_material_files(id, file_path, file_name, created_at)"
            )
            .order("created_at", { ascending: false });

        if (error) {
            showPageError(
                `Learning materials could not be loaded: ${error.message}`
            );
            return false;
        }

        learningMaterials = data || [];

        await loadProfileNames(
            learningMaterials.flatMap((material) => [
                material.teacher_id,
                material.audience_student_id
            ])
        );

        renderMaterials();
        return true;
    }

    async function createMaterial(event) {
        event.preventDefault();
        hideInlineMessage(materialFormMessage);

        const title = materialTitle.value.trim();
        const description = materialDescription.value.trim();
        const type = materialType.value;
        const audienceStudentId = materialStudent.value || null;
        const files = [...selectedMaterialFiles];
        const externalUrl = materialLink.value.trim();

        if (title.length < 2) {
            showInlineMessage(
                materialFormMessage,
                "Enter a material title.",
                true
            );
            return;
        }

        if (type === "file") {
            const fileError = validateMaterialFiles(files);

            if (fileError) {
                showInlineMessage(
                    materialFormMessage,
                    fileError,
                    true
                );
                return;
            }
        } else if (!isSafeExternalUrl(externalUrl)) {
            showInlineMessage(
                materialFormMessage,
                "Enter a valid http:// or https:// link.",
                true
            );
            return;
        }

        setButtonLoading(saveMaterialButton, "Sharing...", true);

        const uploadedFiles = [];
        let createdMaterialId = null;

        try {
            if (type === "file") {
                for (const file of files) {
                    const path = await uploadCourseFile(
                        "materials",
                        file
                    );

                    uploadedFiles.push({
                        file_path: path,
                        file_name: file.name
                    });
                }
            }

            const primaryFile = uploadedFiles[0] || null;

            const {
                data: createdMaterial,
                error
            } = await client
                .from("learning_materials")
                .insert({
                    teacher_id: currentUser.id,
                    audience_student_id: audienceStudentId,
                    title,
                    description,
                    material_type: type,
                    file_path: primaryFile?.file_path || null,
                    file_name: primaryFile?.file_name || null,
                    external_url: type === "link" ? externalUrl : null
                })
                .select("id")
                .single();

            if (error) throw error;

            createdMaterialId = createdMaterial.id;

            if (type === "file") {
                const { error: filesError } = await client
                    .from("learning_material_files")
                    .insert(
                        uploadedFiles.map((file) => ({
                            material_id: createdMaterialId,
                            file_path: file.file_path,
                            file_name: file.file_name
                        }))
                    );

                if (filesError) throw filesError;
            }

            await notifyMaterialAudience(
                audienceStudentId,
                title
            );

            materialForm.reset();
            selectedMaterialFiles = [];
            renderSelectedMaterialFiles();
            materialType.dispatchEvent(new Event("change"));
            showInlineMessage(
                materialFormMessage,
                "The material has been shared."
            );
            await loadMaterials();
        } catch (error) {
            if (createdMaterialId) {
                const { error: rollbackError } = await client
                    .from("learning_materials")
                    .delete()
                    .eq("id", createdMaterialId);

                if (rollbackError) {
                    console.error(
                        "Material rollback failed:",
                        rollbackError.message
                    );
                }
            }

            for (const file of uploadedFiles) {
                await removeCourseFile(file.file_path);
            }

            showInlineMessage(
                materialFormMessage,
                `The material could not be shared: ${error.message}`,
                true
            );
        } finally {
            setButtonLoading(saveMaterialButton, "Sharing...", false);
        }
    }

    async function deleteMaterial(material, button) {
        const confirmed = window.confirm(
            `Delete “${material.title}”? Students will no longer be able to access it.`
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Deleting...";

        const { error } = await client
            .from("learning_materials")
            .delete()
            .eq("id", material.id);

        if (error) {
            button.disabled = false;
            button.textContent = "Delete";
            showPageError(
                `The material could not be deleted: ${error.message}`
            );
            return;
        }

        for (const file of getMaterialFiles(material)) {
            await removeCourseFile(file.file_path);
        }

        await loadMaterials();
        showPageNotice("The material has been deleted.");
    }

    function getHomeworkStatus(assignment, submission) {
        if (submission) return submission.status;

        if (
            assignment.due_at &&
            new Date(assignment.due_at).getTime() < Date.now()
        ) {
            return "overdue";
        }

        return "pending";
    }

    function homeworkStatusLabel(status) {
        const labels = {
            pending: "Pending",
            overdue: "Overdue",
            submitted: "Submitted",
            reviewed: "Reviewed",
            changes_requested: "Changes requested"
        };

        return labels[status] || "Pending";
    }

    function appendAssignmentAttachment(container, assignment) {
        if (!assignment.attachment_path) return;

        const wrapper = document.createElement("div");
        wrapper.className = "homework-attachment";
        wrapper.appendChild(
            createDownloadButton(
                assignment.attachment_path,
                assignment.attachment_name,
                `Download ${assignment.attachment_name}`
            )
        );
        container.appendChild(wrapper);
    }

    function createSubmissionSummary(submission) {
        const container = document.createElement("div");
        container.className = "homework-submission";

        const heading = document.createElement("h4");
        heading.textContent = "Student submission";
        container.appendChild(heading);

        if (submission.response_text) {
            const response = document.createElement("p");
            response.textContent = submission.response_text;
            container.appendChild(response);
        }

        if (submission.file_path) {
            const actions = document.createElement("div");
            actions.className = "homework-submit-actions";
            actions.appendChild(
                createDownloadButton(
                    submission.file_path,
                    submission.file_name,
                    `Download ${submission.file_name}`
                )
            );
            container.appendChild(actions);
        }

        const meta = document.createElement("div");
        meta.className = "homework-meta";
        meta.textContent =
            `Submitted ${formatDate(submission.submitted_at, true)}`;
        container.appendChild(meta);

        return container;
    }

    function appendTeacherReview(
        card,
        assignment,
        submission
    ) {
        if (!submission) {
            const waiting = document.createElement("div");
            waiting.className = "homework-submission";

            const text = document.createElement("p");
            text.textContent =
                "The student has not submitted this homework yet.";
            waiting.appendChild(text);
            card.appendChild(waiting);
            return;
        }

        card.appendChild(createSubmissionSummary(submission));

        const form = document.createElement("form");
        form.className = "homework-review-form";

        const feedback = document.createElement("textarea");
        feedback.className = "homework-feedback";
        feedback.rows = 3;
        feedback.maxLength = 5000;
        feedback.placeholder =
            "Add feedback for the student...";
        feedback.value = submission.teacher_feedback || "";

        const actions = document.createElement("div");
        actions.className = "homework-review-actions";

        const reviewedButton = document.createElement("button");
        reviewedButton.type = "button";
        reviewedButton.className =
            "homework-action-button primary";
        reviewedButton.textContent = "Mark as reviewed";

        const changesButton = document.createElement("button");
        changesButton.type = "button";
        changesButton.className =
            "homework-action-button secondary";
        changesButton.textContent = "Request changes";

        reviewedButton.addEventListener("click", () => {
            reviewHomework(
                assignment,
                "reviewed",
                feedback.value,
                reviewedButton,
                changesButton
            );
        });

        changesButton.addEventListener("click", () => {
            reviewHomework(
                assignment,
                "changes_requested",
                feedback.value,
                changesButton,
                reviewedButton
            );
        });

        actions.append(reviewedButton, changesButton);
        form.append(feedback, actions);
        card.appendChild(form);
    }

    function appendStudentSubmission(
        card,
        assignment,
        submission
    ) {
        if (submission?.teacher_feedback) {
            const feedback = document.createElement("div");
            feedback.className = "homework-feedback-box";
            feedback.textContent =
                `Teacher feedback: ${submission.teacher_feedback}`;
            card.appendChild(feedback);
        }

        if (submission?.status === "reviewed") {
            if (submission.response_text || submission.file_path) {
                card.appendChild(createSubmissionSummary(submission));
            }
            return;
        }

        const form = document.createElement("form");
        form.className = "homework-submit-form";

        const response = document.createElement("textarea");
        response.className = "homework-feedback";
        response.rows = 4;
        response.maxLength = 5000;
        response.placeholder =
            "Write your answer or a note for your teacher...";
        response.value = submission?.response_text || "";

        const file = document.createElement("input");
        file.type = "file";
        file.accept =
            ".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.txt,.mp3,.wav,.ogg";

        const actions = document.createElement("div");
        actions.className = "homework-submit-actions";

        const submitButton = document.createElement("button");
        submitButton.type = "submit";
        submitButton.className =
            "homework-action-button primary";
        submitButton.textContent = submission
            ? "Resubmit homework"
            : "Submit homework";

        actions.append(file, submitButton);
        form.append(response, actions);

        form.addEventListener("submit", (event) => {
            submitHomework(
                event,
                assignment,
                submission,
                response,
                file,
                submitButton
            );
        });

        card.appendChild(form);
    }

    function createHomeworkCard(assignment) {
        const submission = homeworkSubmissions.get(assignment.id);
        const status = getHomeworkStatus(assignment, submission);

        const card = document.createElement("article");
        card.className =
            status === "overdue"
                ? "homework-card overdue"
                : "homework-card";

        const heading = document.createElement("div");
        heading.className = "homework-card-heading";

        const headingText = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = assignment.title;

        const person = document.createElement("p");
        person.textContent =
            currentProfile.role === "teacher"
                ? `Student: ${studentName(assignment.student_id)}`
                : `Teacher: ${teacherName(assignment.teacher_id)}`;

        headingText.append(title, person);

        const statusBadge = document.createElement("span");
        statusBadge.className = `homework-status ${status}`;
        statusBadge.textContent = homeworkStatusLabel(status);

        heading.append(headingText, statusBadge);
        card.appendChild(heading);

        const instructions = document.createElement("p");
        instructions.textContent = assignment.instructions;
        card.appendChild(instructions);

        const meta = document.createElement("div");
        meta.className = "homework-meta";

        const created = document.createElement("span");
        created.textContent =
            `Created ${formatDate(assignment.created_at)}`;
        meta.appendChild(created);

        if (assignment.due_at) {
            const due = document.createElement("span");
            due.textContent =
                `Due ${formatDate(assignment.due_at, true)}`;
            meta.appendChild(due);
        } else {
            const noDeadline = document.createElement("span");
            noDeadline.textContent = "No deadline";
            meta.appendChild(noDeadline);
        }

        card.appendChild(meta);
        appendAssignmentAttachment(card, assignment);

        if (currentProfile.role === "teacher") {
            appendTeacherReview(card, assignment, submission);
        } else {
            appendStudentSubmission(card, assignment, submission);
        }

        return card;
    }

    function renderHomework() {
        homeworkList.replaceChildren();
        homeworkCount.textContent = plural(
            homeworkAssignments.length,
            "assignment",
            "assignments"
        );

        if (!homeworkAssignments.length) {
            homeworkList.appendChild(
                createEmptyState(
                    currentProfile.role === "teacher"
                        ? "Create the first homework assignment for one of your students."
                        : "You do not have any homework assignments yet."
                )
            );
            return;
        }

        homeworkAssignments.forEach((assignment) => {
            homeworkList.appendChild(createHomeworkCard(assignment));
        });
    }

    async function loadHomework() {
        const { data, error } = await client
            .from("homework_assignments")
            .select(
                "id, teacher_id, student_id, title, instructions, due_at, attachment_path, attachment_name, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) {
            showPageError(
                `Homework could not be loaded: ${error.message}`
            );
            return false;
        }

        homeworkAssignments = data || [];
        homeworkSubmissions = new Map();

        const assignmentIds = homeworkAssignments.map(
            (assignment) => assignment.id
        );

        if (assignmentIds.length) {
            const {
                data: submissions,
                error: submissionError
            } = await client
                .from("homework_submissions")
                .select(
                    "id, assignment_id, student_id, response_text, file_path, file_name, status, teacher_feedback, submitted_at, reviewed_at"
                )
                .in("assignment_id", assignmentIds);

            if (submissionError) {
                showPageError(
                    `Homework submissions could not be loaded: ${submissionError.message}`
                );
                return false;
            }

            homeworkSubmissions = new Map(
                (submissions || []).map((submission) => [
                    submission.assignment_id,
                    submission
                ])
            );
        }

        await loadProfileNames(
            homeworkAssignments.flatMap((assignment) => [
                assignment.teacher_id,
                assignment.student_id
            ])
        );

        renderHomework();
        return true;
    }

    async function createHomework(event) {
        event.preventDefault();
        hideInlineMessage(homeworkFormMessage);

        const studentId = homeworkStudent.value;
        const title = homeworkTitle.value.trim();
        const instructions = homeworkInstructions.value.trim();
        const dueValue = homeworkDueAt.value;
        const file = homeworkFile.files?.[0] || null;

        if (!studentId) {
            showInlineMessage(
                homeworkFormMessage,
                "Choose a student.",
                true
            );
            return;
        }

        if (title.length < 2 || instructions.length < 2) {
            showInlineMessage(
                homeworkFormMessage,
                "Add a title and instructions.",
                true
            );
            return;
        }

        if (file) {
            const fileError = validateFile(file);

            if (fileError) {
                showInlineMessage(
                    homeworkFormMessage,
                    fileError,
                    true
                );
                return;
            }
        }

        setButtonLoading(saveHomeworkButton, "Creating...", true);

        let uploadedPath = null;

        try {
            if (file) {
                uploadedPath = await uploadCourseFile(
                    "homework",
                    file
                );
            }

            const { error } = await client
                .from("homework_assignments")
                .insert({
                    teacher_id: currentUser.id,
                    student_id: studentId,
                    title,
                    instructions,
                    due_at: dueValue
                        ? new Date(dueValue).toISOString()
                        : null,
                    attachment_path: uploadedPath,
                    attachment_name: file?.name || null
                });

            if (error) throw error;

            await sendChatNotification(
                currentUser.id,
                studentId,
                `New homework: ${title}. Open Materials to view the assignment.`
            );

            homeworkForm.reset();
            showInlineMessage(
                homeworkFormMessage,
                "The homework assignment has been created."
            );
            await loadHomework();
        } catch (error) {
            await removeCourseFile(uploadedPath);
            showInlineMessage(
                homeworkFormMessage,
                `Homework could not be created: ${error.message}`,
                true
            );
        } finally {
            setButtonLoading(saveHomeworkButton, "Creating...", false);
        }
    }

    async function submitHomework(
        event,
        assignment,
        previousSubmission,
        responseInput,
        fileInput,
        button
    ) {
        event.preventDefault();

        const responseText = responseInput.value.trim();
        const file = fileInput.files?.[0] || null;

        if (file) {
            const fileError = validateFile(file);

            if (fileError) {
                showPageError(fileError);
                return;
            }
        }

        const existingFilePath =
            previousSubmission?.file_path || null;
        const existingFileName =
            previousSubmission?.file_name || null;

        if (!responseText && !file && !existingFilePath) {
            showPageError(
                "Write an answer or attach a homework file."
            );
            return;
        }

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = file ? "Uploading..." : "Submitting...";

        let newFilePath = null;

        try {
            if (file) {
                newFilePath = await uploadCourseFile(
                    "submissions",
                    file
                );
            }

            const { error } = await client.rpc(
                "submit_homework",
                {
                    p_assignment_id: assignment.id,
                    p_response_text: responseText || null,
                    p_file_path:
                        newFilePath || existingFilePath,
                    p_file_name:
                        file?.name || existingFileName
                }
            );

            if (error) throw error;

            if (
                newFilePath &&
                existingFilePath &&
                newFilePath !== existingFilePath
            ) {
                await removeCourseFile(existingFilePath);
            }

            await sendChatNotification(
                assignment.teacher_id,
                assignment.student_id,
                `Homework submitted: ${assignment.title}. Open Materials to review it.`
            );

            await loadHomework();
            showPageNotice("Your homework has been submitted.");
        } catch (error) {
            await removeCourseFile(newFilePath);
            showPageError(
                `Homework could not be submitted: ${error.message}`
            );
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    async function reviewHomework(
        assignment,
        status,
        feedback,
        activeButton,
        otherButton
    ) {
        activeButton.disabled = true;
        otherButton.disabled = true;
        const originalText = activeButton.textContent;
        activeButton.textContent = "Saving...";

        const { error } = await client.rpc(
            "review_homework",
            {
                p_assignment_id: assignment.id,
                p_status: status,
                p_feedback: feedback.trim() || null
            }
        );

        activeButton.disabled = false;
        otherButton.disabled = false;
        activeButton.textContent = originalText;

        if (error) {
            showPageError(
                `The homework review could not be saved: ${error.message}`
            );
            return;
        }

        await sendChatNotification(
            assignment.teacher_id,
            assignment.student_id,
            status === "reviewed"
                ? `Homework reviewed: ${assignment.title}. Open Materials to see the feedback.`
                : `Changes requested: ${assignment.title}. Open Materials to see the feedback.`
        );

        await loadHomework();
        showPageNotice("The homework review has been saved.");
    }

    function initializeTabs() {
        const buttons = [
            ...document.querySelectorAll(".materials-tab")
        ];

        buttons.forEach((button) => {
            button.addEventListener("click", () => {
                buttons.forEach((tab) => {
                    const selected = tab === button;
                    tab.classList.toggle("active", selected);
                    tab.setAttribute(
                        "aria-selected",
                        String(selected)
                    );

                    const panel = document.getElementById(
                        tab.dataset.panel
                    );

                    panel.hidden = !selected;
                    panel.classList.toggle("active", selected);
                });
            });
        });
    }

    function configureRoleInterface() {
        const isTeacher = currentProfile.role === "teacher";

        dashboardLink.href = isTeacher
            ? "teacher-dashboard.html"
            : "student-dashboard.html";

        teachersLink.hidden = isTeacher;
        teacherMaterialComposer.hidden = !isTeacher;
        teacherHomeworkComposer.hidden = !isTeacher;

        document.getElementById("materialsEyebrow").textContent =
            isTeacher ? "Teacher resources" : "Student learning space";

        document.getElementById("materialsTitle").textContent =
            isTeacher
                ? "Materials and homework"
                : "Your materials and homework";

        document.getElementById("materialsIntro").textContent =
            isTeacher
                ? "Share resources, create assignments, and review student work."
                : "Download resources from your teachers and submit your homework.";
    }

    async function initializePage() {
        const {
            data: userData,
            error: userError
        } = await client.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace("login.html#login");
            return;
        }

        currentUser = userData.user;

        const {
            data: profile,
            error: profileError
        } = await client
            .from("profiles")
            .select("full_name, role")
            .eq("id", currentUser.id)
            .single();

        if (profileError || !profile) {
            showPageError(
                "Your profile could not be loaded."
            );
            return;
        }

        currentProfile = profile;
        profileNames.set(currentUser.id, profile.full_name);

        configureRoleInterface();

        const studentsLoaded = await loadTeacherStudents();
        if (!studentsLoaded) return;

        const [materialsLoaded, homeworkLoaded] =
            await Promise.all([
                loadMaterials(),
                loadHomework()
            ]);

        if (!materialsLoaded || !homeworkLoaded) return;

        pageContent.hidden = false;
        hidePageMessage();
    }

    materialType.addEventListener("change", () => {
        const usesFile = materialType.value === "file";
        materialFileField.hidden = !usesFile;
        materialFileSelection.hidden =
            !usesFile || selectedMaterialFiles.length === 0;
        materialLinkField.hidden = usesFile;
        materialFile.required = false;
        materialLink.required = !usesFile;
    });

    materialFile.addEventListener("change", () => {
        addSelectedMaterialFiles([
            ...(materialFile.files || [])
        ]);

        // The real selection is kept in selectedMaterialFiles so that
        // opening the picker again adds files instead of replacing them.
        materialFile.value = "";
    });

    materialForm.addEventListener("submit", createMaterial);
    homeworkForm.addEventListener("submit", createHomework);

    document
        .getElementById("logoutButton")
        .addEventListener("click", async () => {
            const button = document.getElementById("logoutButton");
            button.disabled = true;
            button.textContent = "Logging out...";
            await client.auth.signOut();
            window.location.replace("login.html#login");
        });

    if (!configIsReady) {
        showPageError(
            "Add your Supabase URL and publishable key to supabase-config.js."
        );
        return;
    }

    client = window.supabase.createClient(
        supabaseUrl,
        supabaseKey
    );

    window.POLYGLOT_DASHBOARD_CLIENT = client;

    client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            window.location.replace("login.html#login");
        }
    });

    initializeTabs();
    materialType.dispatchEvent(new Event("change"));
    initializePage();
})();
