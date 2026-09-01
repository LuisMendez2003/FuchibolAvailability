// Keeps the cached event data fresh without blocking month navigation.
// app.js renders the cached month immediately; this file revalidates the
// shared Supabase data in the background and updates the UI only on changes.

(function initCalendarSync() {
  let revalidateTimer = null;

  function setsEqual(a, b) {
    if (a.size !== b.size) return false;

    for (const value of a) {
      if (!b.has(value)) return false;
    }

    return true;
  }

  function availabilityMapsEqual(a, b) {
    const aDates = Object.keys(a);
    const bDates = Object.keys(b);

    if (aDates.length !== bDates.length) {
      return false;
    }

    for (const date of aDates) {
      const left = a[date];
      const right = b[date];

      if (!right) return false;

      if (
        !setsEqual(left.available, right.available) ||
        !setsEqual(left.unavailable, right.unavailable)
      ) {
        return false;
      }
    }

    return true;
  }

  async function revalidateEventData() {
    if (!sb || !currentEventId) {
      return;
    }

    const token = ++monthLoadToken;
    const requestedEventId = currentEventId;

    const { data, error } = await sb
      .from(AVAIL_TABLE)
      .select("person_name, date, status")
      .eq("event_id", requestedEventId)
      .order("date", {
        ascending: true,
      });

    if (
      token !== monthLoadToken ||
      requestedEventId !== currentEventId
    ) {
      return;
    }

    // Background refreshes must never replace a valid cached calendar with
    // an error state. The next interaction can try again.
    if (error) {
      console.error("Error revalidando disponibilidad:", error);
      return;
    }

    const perDate = {};
    const people = new Set();

    (data || []).forEach((row) => {
      people.add(row.person_name);

      if (!perDate[row.date]) {
        perDate[row.date] = {
          available: new Set(),
          unavailable: new Set(),
        };
      }

      if (row.status === "available") {
        perDate[row.date].available.add(row.person_name);
      } else {
        perDate[row.date].unavailable.add(row.person_name);
      }
    });

    const changed =
      cachedEventId !== requestedEventId ||
      !availabilityMapsEqual(cachedPerDate, perDate) ||
      !setsEqual(cachedPeople, people);

    if (!changed) {
      return;
    }

    cachedPerDate = perDate;
    cachedPeople = people;
    cachedEventId = requestedEventId;

    renderCurrentMonth();
    renderBestDate(cachedPerDate);
    renderParticipants(cachedPeople);
  }

  function scheduleRevalidation() {
    if (!currentEventId) {
      return;
    }

    clearTimeout(revalidateTimer);

    revalidateTimer = setTimeout(() => {
      revalidateTimer = null;
      void revalidateEventData();
    }, 120);
  }

  // The handlers in app.js run first and render the requested month from the
  // cache synchronously. We then refresh shared data without showing a loader.
  document
    .getElementById("prevMonth")
    .addEventListener("click", scheduleRevalidation);

  document
    .getElementById("nextMonth")
    .addEventListener("click", scheduleRevalidation);

  // Refresh when the user returns to the tab, which is useful while several
  // people are editing the same event from different devices.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleRevalidation();
    }
  });

  // openDateModal already reads fresh rows from Supabase. Ignore the cached
  // snapshot passed by the calendar cell so stale and fresh statuses can never
  // be combined in the same modal.
  const openDateModalWithFreshData = openDateModal;

  openDateModal = function openFreshDateModal(date) {
    return openDateModalWithFreshData(date, null);
  };
})();
