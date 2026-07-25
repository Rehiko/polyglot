import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Booking = {
  id: string;
  student_id: string;
  teacher_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  meeting_url: string | null;
  google_event_id: string | null;
};

type GoogleEvent = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: {
      status?: {
        statusCode?: string;
      };
    };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
  extendedProperties?: {
    private?: {
      polyglotBookingId?: string;
    };
  };
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function uuidToGoogleEventId(uuid: string) {
  const hex = uuid.replaceAll("-", "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error("Invalid booking ID.");
  }

  const alphabet = "0123456789abcdefghijklmnopqrstuv";
  const bytes = [];

  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }

  let output = "";
  let buffer = 0;
  let bitCount = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;

    while (bitCount >= 5) {
      bitCount -= 5;
      output += alphabet[(buffer >>> bitCount) & 31];
    }

    buffer &= (1 << bitCount) - 1;
  }

  if (bitCount > 0) {
    output += alphabet[(buffer << (5 - bitCount)) & 31];
  }

  return `p${output}`;
}

function getMeetUrl(event: GoogleEvent) {
  if (event.hangoutLink?.startsWith("https://meet.google.com/")) {
    return event.hangoutLink;
  }

  const videoEntry = event.conferenceData?.entryPoints?.find(
    (entry) =>
      entry.entryPointType === "video" &&
      entry.uri?.startsWith("https://meet.google.com/")
  );

  return videoEntry?.uri || null;
}

async function getGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("Google token refresh failed:", response.status, data.error);
    throw new Error("Google Calendar authorization could not be refreshed.");
  }

  return data.access_token as string;
}

async function getCalendarEvent(accessToken: string, eventId: string) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google event lookup failed:", response.status, errorText);
    throw new Error("The Google Calendar event could not be loaded.");
  }

  return await response.json() as GoogleEvent;
}

async function createCalendarEvent(
  accessToken: string,
  eventId: string,
  booking: Booking,
  studentName: string,
  teacherName: string,
  studentEmail: string,
  teacherEmail: string
) {
  const attendeeEmails = [...new Set([studentEmail, teacherEmail])]
    .filter((email) => email !== "polyglot.school.admin@gmail.com");

  const attendees = attendeeEmails.map((email) => ({
    email,
    displayName:
      email === studentEmail ? studentName : teacherName
  }));

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
      "?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: eventId,
        summary: `Polyglot lesson: ${teacherName} & ${studentName}`,
        description:
          "Language lesson booked through Polyglot.\n\n" +
          `Teacher: ${teacherName}\n` +
          `Student: ${studentName}\n\n` +
          "The Google Meet link is included in this event and in the Polyglot chat.",
        start: {
          dateTime: new Date(booking.starts_at).toISOString()
        },
        end: {
          dateTime: new Date(booking.ends_at).toISOString()
        },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `polyglot-${booking.id}`,
            conferenceSolutionKey: {
              type: "hangoutsMeet"
            }
          }
        },
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: true,
        visibility: "private",
        reminders: {
          useDefault: false,
          overrides: [
            {
              method: "email",
              minutes: 1440
            },
            {
              method: "popup",
              minutes: 10
            }
          ]
        },
        extendedProperties: {
          private: {
            polyglotBookingId: booking.id
          }
        }
      })
    }
  );

  if (response.status === 409) {
    const existingEvent = await getCalendarEvent(accessToken, eventId);

    if (
      existingEvent.extendedProperties?.private?.polyglotBookingId !==
      booking.id
    ) {
      throw new Error("A conflicting Google Calendar event already exists.");
    }

    return existingEvent;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google event creation failed:", response.status, errorText);
    throw new Error("Google Calendar could not create the lesson event.");
  }

  return await response.json() as GoogleEvent;
}

async function ensureConferenceRequest(
  accessToken: string,
  eventId: string,
  event: GoogleEvent
) {
  if (
    getMeetUrl(event) ||
    event.conferenceData?.createRequest?.status?.statusCode === "pending"
  ) {
    return event;
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}` +
      "?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: {
              type: "hangoutsMeet"
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Meet request failed:", response.status, errorText);
    throw new Error("Google Meet could not be added to the event.");
  }

  return await response.json() as GoogleEvent;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed."
      },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !googleClientId ||
      !googleClientSecret ||
      !googleRefreshToken
    ) {
      throw new Error("Required Edge Function secrets are missing.");
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        {
          error: "Authentication is required."
        },
        401
      );
    }

    const accessJwt = authorization.slice("Bearer ".length);

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabaseAdmin.auth.getUser(accessJwt);

    if (userError || !user) {
      return jsonResponse(
        {
          error: "Your session is invalid or has expired."
        },
        401
      );
    }

    const requestBody = await request.json();
    const bookingId =
      typeof requestBody?.booking_id === "string"
        ? requestBody.booking_id
        : "";

    if (!bookingId) {
      return jsonResponse(
        {
          error: "booking_id is required."
        },
        400
      );
    }

    const {
      data: booking,
      error: bookingError
    } = await supabaseAdmin
      .from("lesson_bookings")
      .select(
        "id, student_id, teacher_id, starts_at, ends_at, status, meeting_url, google_event_id"
      )
      .eq("id", bookingId)
      .single<Booking>();

    if (bookingError || !booking) {
      return jsonResponse(
        {
          error: "Booking was not found."
        },
        404
      );
    }

    if (
      user.id !== booking.student_id &&
      user.id !== booking.teacher_id
    ) {
      return jsonResponse(
        {
          error: "You do not have access to this booking."
        },
        403
      );
    }

    if (booking.status !== "scheduled") {
      return jsonResponse(
        {
          error: "Google Meet can only be created for a scheduled lesson."
        },
        409
      );
    }

    if (booking.meeting_url) {
      return jsonResponse({
        meeting_url: booking.meeting_url,
        already_exists: true
      });
    }

    await supabaseAdmin
      .from("lesson_bookings")
      .update({
        meeting_status: "creating"
      })
      .eq("id", booking.id);

    const [
      studentAuthResult,
      teacherAuthResult,
      profileResult
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(booking.student_id),
      supabaseAdmin.auth.admin.getUserById(booking.teacher_id),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", [booking.student_id, booking.teacher_id])
    ]);

    const studentEmail = studentAuthResult.data.user?.email;
    const teacherEmail = teacherAuthResult.data.user?.email;

    if (
      studentAuthResult.error ||
      teacherAuthResult.error ||
      !studentEmail ||
      !teacherEmail
    ) {
      throw new Error("Student or teacher email could not be loaded.");
    }

    if (profileResult.error) {
      throw new Error("Student or teacher profile could not be loaded.");
    }

    const profiles = new Map(
      (profileResult.data || []).map((profile) => [
        profile.id,
        profile.full_name
      ])
    );

    const studentName =
      profiles.get(booking.student_id) || "Polyglot student";
    const teacherName =
      profiles.get(booking.teacher_id) || "Polyglot teacher";

    const googleAccessToken = await getGoogleAccessToken(
      googleClientId,
      googleClientSecret,
      googleRefreshToken
    );

    const eventId =
      booking.google_event_id || uuidToGoogleEventId(booking.id);

    let googleEvent = await createCalendarEvent(
      googleAccessToken,
      eventId,
      booking,
      studentName,
      teacherName,
      studentEmail,
      teacherEmail
    );

    googleEvent = await ensureConferenceRequest(
      googleAccessToken,
      eventId,
      googleEvent
    );

    let meetingUrl = getMeetUrl(googleEvent);

    for (let attempt = 0; attempt < 8 && !meetingUrl; attempt += 1) {
      await delay(750);
      googleEvent = await getCalendarEvent(
        googleAccessToken,
        eventId
      );
      meetingUrl = getMeetUrl(googleEvent);
    }

    if (!meetingUrl) {
      throw new Error(
        "Google Calendar created the event, but the Meet link is still being prepared. Try again shortly."
      );
    }

    const {
      error: saveError
    } = await supabaseAdmin.rpc("set_booking_google_meet", {
      p_booking_id: booking.id,
      p_meeting_url: meetingUrl,
      p_google_event_id: eventId
    });

    if (saveError) {
      console.error("Meet link database save failed:", saveError);
      throw new Error(
        "The Meet link was created but could not be saved in Polyglot."
      );
    }

    return jsonResponse({
      meeting_url: meetingUrl,
      google_event_id: eventId,
      already_exists: false
    });
  } catch (error) {
    console.error("create-google-meet failed:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Meet could not be created."
      },
      500
    );
  }
});