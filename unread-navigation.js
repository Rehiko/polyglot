(function () {
    "use strict";

    const unreadBadge =
        document.getElementById("dashboardUnreadCount");

    const supabaseClient =
        window.POLYGLOT_DASHBOARD_CLIENT;

    if (!unreadBadge || !supabaseClient) {
        return;
    }

    let realtimeChannel = null;
    let refreshIsRunning = false;

    function displayUnreadCount(count) {
        const unreadCount = Number(count || 0);

        unreadBadge.hidden = unreadCount === 0;

        unreadBadge.textContent =
            unreadCount > 99
                ? "99+"
                : String(unreadCount);

        unreadBadge.setAttribute(
            "aria-label",
            unreadCount === 1
                ? "1 unread message"
                : `${unreadCount} unread messages`
        );
    }

    async function refreshUnreadCount() {
        if (refreshIsRunning) {
            return;
        }

        refreshIsRunning = true;

        const { data, error } = await supabaseClient.rpc(
            "get_my_unread_conversation_counts"
        );

        refreshIsRunning = false;

        if (error) {
            console.error(
                "Unread messages could not be loaded:",
                error.message
            );

            unreadBadge.hidden = true;
            return;
        }

        const totalUnread = (data || []).reduce(
            (total, conversation) => {
                return (
                    total +
                    Number(conversation.unread_count || 0)
                );
            },
            0
        );

        displayUnreadCount(totalUnread);
    }

    function subscribeToUnreadMessages(userId) {
        realtimeChannel = supabaseClient
            .channel(`dashboard-unread-${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "conversation_messages"
                },
                () => {
                    refreshUnreadCount();
                }
            )
            .subscribe();
    }

    async function initializeUnreadIndicator() {
        const {
            data: userData,
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError || !userData.user) {
            unreadBadge.hidden = true;
            return;
        }

        await refreshUnreadCount();
        subscribeToUnreadMessages(userData.user.id);
    }

    window.addEventListener("focus", () => {
        refreshUnreadCount();
    });

    window.addEventListener("pagehide", () => {
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
        }
    });

    initializeUnreadIndicator();
})();