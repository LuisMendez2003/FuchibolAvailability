// Mantiene fresco el cache del evento sin bloquear la navegación entre meses.
// app.js pinta el mes cacheado inmediatamente; este archivo revalida los datos
// compartidos de Supabase en segundo plano y actualiza la UI solo si cambiaron.

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

    // Un refresco en segundo plano nunca debe reemplazar un calendario válido
    // por un estado de error. La siguiente interacción podrá reintentarlo.
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

  // Los handlers de app.js se ejecutan primero y pintan el mes solicitado
  // desde el cache. Luego refrescamos los datos compartidos sin mostrar loader.
  document
    .getElementById("prevMonth")
    .addEventListener("click", scheduleRevalidation);

  document
    .getElementById("nextMonth")
    .addEventListener("click", scheduleRevalidation);

  // Refresca al volver a la pestaña, útil cuando varias personas editan el
  // mismo evento desde dispositivos diferentes.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleRevalidation();
    }
  });

  // openDateModal ya consulta filas frescas en Supabase. Ignoramos el snapshot
  // cacheado de la celda para no mezclar estados antiguos y nuevos en el modal.
  const openDateModalWithFreshData = openDateModal;

  openDateModal = function openFreshDateModal(date) {
    return openDateModalWithFreshData(date, null);
  };
})();
