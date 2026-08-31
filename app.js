// ======================================================================
// 1) TEMA
// ======================================================================

const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("pichanga-theme", theme);
}

(function initTheme() {
  const saved = localStorage.getItem("pichanga-theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyTheme(saved || (prefersDark ? "dark" : "light"));
})();

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});


// ======================================================================
// 2) ERROR
// ======================================================================

function showFatalError(message) {
  let banner = document.getElementById("fatalErrorBanner");

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "fatalErrorBanner";
    banner.style.cssText =
      "background:#E14F4F;color:#fff;padding:12px 16px;font-family:sans-serif;font-size:13.5px;text-align:center;position:sticky;top:0;z-index:999;";
    document.body.prepend(banner);
  }

  banner.textContent = message;
}


// ======================================================================
// 3) SUPABASE
// ======================================================================

let sb = null;

const EVENTS_TABLE = "events";
const AVAIL_TABLE = "availability";

try {
  if (
    typeof SUPABASE_URL !== "string" ||
    SUPABASE_URL.includes("PEGA_AQUI")
  ) {
    throw new Error("Falta configurar SUPABASE_URL en config.js");
  }

  if (
    typeof SUPABASE_ANON_KEY !== "string" ||
    SUPABASE_ANON_KEY.includes("PEGA_AQUI")
  ) {
    throw new Error("Falta configurar SUPABASE_ANON_KEY en config.js");
  }

  if (!window.supabase) {
    throw new Error(
      "No se pudo cargar la librería de Supabase."
    );
  }

  sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
} catch (err) {
  console.error("Error inicializando Supabase:", err);
  showFatalError(
    "⚠️ No se pudo conectar a la base de datos: " +
      err.message +
      " (revisa config.js)"
  );
}


// ======================================================================
// 4) HELPERS DE FECHAS
// ======================================================================

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const APP_NAME = "Organizador de eventos de Luis";

function pad(n) {
  return n.toString().padStart(2, "0");
}

function dateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function firstWeekdayMon0(y, m) {
  const jsDay = new Date(y, m, 1).getDay();
  return (jsDay + 6) % 7;
}

function buildCalendarCells(y, m) {
  const cells = [];
  const blanks = firstWeekdayMon0(y, m);

  for (let i = 0; i < blanks; i++) {
    cells.push(null);
  }

  const total = daysInMonth(y, m);

  for (let d = 1; d <= total; d++) {
    cells.push(d);
  }

  return cells;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function isDateInRange(dateStr) {
  if (!currentEventStartDate && !currentEventEndDate) {
    return true;
  }

  if (currentEventStartDate && dateStr < currentEventStartDate) {
    return false;
  }

  if (currentEventEndDate && dateStr > currentEventEndDate) {
    return false;
  }

  return true;
}

function monthHasRange(year, month) {
  const first = dateKey(year, month, 1);
  const last = dateKey(
    year,
    month,
    daysInMonth(year, month)
  );

  if (currentEventStartDate && last < currentEventStartDate) {
    return false;
  }

  if (currentEventEndDate && first > currentEventEndDate) {
    return false;
  }

  return true;
}

function clampMainMonth() {
  if (
    currentEventStartDate &&
    !monthHasRange(viewYear, viewMonth)
  ) {
    const [y, m] = currentEventStartDate
      .split("-")
      .map(Number);

    viewYear = y;
    viewMonth = m - 1;
  }
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);

  const dateObj = new Date(y, m - 1, d);

  const weekday = dateObj.toLocaleDateString("es-PE", {
    weekday: "long",
  });

  return (
    weekday.charAt(0).toUpperCase() +
    weekday.slice(1) +
    ` ${d} de ${MONTH_NAMES[m - 1]}`
  );
}

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);

  const dateObj = new Date(y, m - 1, d);

  const weekday = dateObj.toLocaleDateString("es-PE", {
    weekday: "short",
  });

  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${d} ${
    MONTH_NAMES[m - 1].slice(0, 3)
  }`;
}


// ======================================================================
// 5) PANTALLAS
// ======================================================================

const eventsScreen = document.getElementById("eventsScreen");
const eventScreen = document.getElementById("eventScreen");

const openAddAvailabilityBtn =
  document.getElementById("openAddAvailability");

const openCreateEventBtn =
  document.getElementById("openCreateEvent");

const backToEventsBtn =
  document.getElementById("backToEvents");

const eventTitle =
  document.getElementById("eventTitle");

const brandTitle =
  document.getElementById("brandTitle");

let currentEventId = null;
let currentEventName = "";
let currentEventStartDate = null;
let currentEventEndDate = null;

let viewYear;
let viewMonth;

let modalYear;
let modalMonth;

let mySelections = {};
let currentPersonName = "";


// Token para evitar el bug de renders duplicados.
// Si una petición vieja termina después de una nueva,
// simplemente se ignora.
let monthLoadToken = 0;


function showEventsScreen() {
  currentEventId = null;
  currentEventName = "";
  currentEventStartDate = null;
  currentEventEndDate = null;

  eventsScreen.classList.remove("hidden");
  eventScreen.classList.add("hidden");

  openAddAvailabilityBtn.classList.add("hidden");
  openCreateEventBtn.classList.remove("hidden");

  brandTitle.textContent = APP_NAME;

  const url = new URL(window.location);
  url.searchParams.delete("event");

  window.history.replaceState({}, "", url);

  loadEvents();
}


async function showEventScreen(
  id,
  name,
  startDate = null,
  endDate = null
) {
  currentEventId = id;
  currentEventName = name;

  currentEventStartDate = startDate || null;
  currentEventEndDate = endDate || null;

  eventsScreen.classList.add("hidden");
  eventScreen.classList.remove("hidden");

  openAddAvailabilityBtn.classList.remove("hidden");
  openCreateEventBtn.classList.add("hidden");

  eventTitle.textContent = name;

  // El header ya no cambia con el evento.
  brandTitle.textContent = APP_NAME;

  const url = new URL(window.location);
  url.searchParams.set("event", id);

  window.history.replaceState({}, "", url);

  mySelections = {};

  if (currentEventStartDate) {
    const [y, m] = currentEventStartDate
      .split("-")
      .map(Number);

    viewYear = y;
    viewMonth = m - 1;
  } else {
    const today = new Date();

    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
  }

  clampMainMonth();

  await loadMonthData();
}


backToEventsBtn.addEventListener(
  "click",
  showEventsScreen
);


// ======================================================================
// 6) LISTA DE EVENTOS
// ======================================================================

const eventsList =
  document.getElementById("eventsList");

const eventsEmptyHint =
  document.getElementById("eventsEmptyHint");


async function loadEvents() {
  if (!sb) return;

  eventsList.innerHTML = "";

  const { data, error } = await sb
    .from(EVENTS_TABLE)
    .select(
      "id, name, start_date, end_date, created_at"
    )
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(error);

    eventsList.innerHTML = `
      <div style="color:var(--unavailable);font-size:13px;">
        No se pudo cargar la lista de eventos:
        ${escapeHtml(error.message)}
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {
    eventsEmptyHint.classList.remove("hidden");
    return;
  }

  eventsEmptyHint.classList.add("hidden");

  data.forEach((ev) => {
    const card = document.createElement("div");

    card.className = "event-card";

    const mainButton = document.createElement("button");

    mainButton.className = "event-card-main";

    mainButton.innerHTML = `
      <span class="event-card-content">
        <span class="event-card-name">
          ${escapeHtml(ev.name)}
        </span>

        ${
          ev.start_date || ev.end_date
            ? `<span class="event-card-range">
                ${ev.start_date || "Sin inicio"} → ${
                ev.end_date || "Sin fin"
              }
              </span>`
            : ""
        }
      </span>

      <span class="event-card-arrow">›</span>
    `;

    mainButton.addEventListener("click", () => {
      showEventScreen(
        ev.id,
        ev.name,
        ev.start_date,
        ev.end_date
      );
    });

    const deleteButton =
      document.createElement("button");

    deleteButton.className =
      "event-delete-btn";

    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";

    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation();

      const confirmed = confirm(
        `¿Seguro que quieres eliminar "${ev.name}"?\n\n` +
          "Se eliminarán también todas las disponibilidades de este evento."
      );

      if (!confirmed) return;

      deleteButton.disabled = true;
      deleteButton.textContent = "Eliminando...";

      const { error } = await sb
        .from(EVENTS_TABLE)
        .delete()
        .eq("id", ev.id);

      if (error) {
        console.error(error);

        alert(
          "No se pudo eliminar el evento:\n" +
            error.message
        );

        deleteButton.disabled = false;
        deleteButton.textContent = "Eliminar";

        return;
      }

      await loadEvents();
    });

    card.appendChild(mainButton);
    card.appendChild(deleteButton);

    eventsList.appendChild(card);
  });
}


// ======================================================================
// 7) CREAR EVENTO
// ======================================================================

const eventModalOverlay =
  document.getElementById("eventModalOverlay");

const eventNameInput =
  document.getElementById("eventNameInput");

const eventStartDateInput =
  document.getElementById("eventStartDateInput");

const eventEndDateInput =
  document.getElementById("eventEndDateInput");

const createEventBtn =
  document.getElementById("createEventBtn");

const createEventStatus =
  document.getElementById("createEventStatus");


openCreateEventBtn.addEventListener("click", () => {
  eventNameInput.value = "";
  eventStartDateInput.value = "";
  eventEndDateInput.value = "";

  createEventStatus.textContent = "";
  createEventStatus.className = "save-status";

  eventModalOverlay.classList.remove("hidden");

  eventNameInput.focus();
});


document
  .getElementById("closeEventModal")
  .addEventListener("click", () => {
    eventModalOverlay.classList.add("hidden");
  });


eventModalOverlay.addEventListener(
  "click",
  (e) => {
    if (e.target === eventModalOverlay) {
      eventModalOverlay.classList.add("hidden");
    }
  }
);


createEventBtn.addEventListener(
  "click",
  async () => {
    if (!sb) {
      createEventStatus.textContent =
        "No hay conexión a la base de datos.";

      createEventStatus.className =
        "save-status error";

      return;
    }

    const name = eventNameInput.value.trim();

    const startDate =
      eventStartDateInput.value || null;

    const endDate =
      eventEndDateInput.value || null;

    if (!name) {
      createEventStatus.textContent =
        "Ponle un nombre al evento.";

      createEventStatus.className =
        "save-status error";

      return;
    }

    // Si pone uno, tiene que poner ambos.
    if (
      (startDate && !endDate) ||
      (!startDate && endDate)
    ) {
      createEventStatus.textContent =
        "Si defines un rango, debes indicar fecha inicial y final.";

      createEventStatus.className =
        "save-status error";

      return;
    }

    if (startDate && endDate && startDate > endDate) {
      createEventStatus.textContent =
        "La fecha inicial no puede ser posterior a la fecha final.";

      createEventStatus.className =
        "save-status error";

      return;
    }

    createEventBtn.disabled = true;

    createEventStatus.textContent =
      "Creando...";

    createEventStatus.className =
      "save-status";

    const { data, error } = await sb
      .from(EVENTS_TABLE)
      .insert({
        name,
        start_date: startDate,
        end_date: endDate,
      })
      .select()
      .single();

    createEventBtn.disabled = false;

    if (error) {
      console.error(error);

      createEventStatus.textContent =
        "Error al crear el evento: " +
        error.message;

      createEventStatus.className =
        "save-status error";

      return;
    }

    eventModalOverlay.classList.add("hidden");

    showEventScreen(
      data.id,
      data.name,
      data.start_date,
      data.end_date
    );
  }
);


// ======================================================================
// 8) CALENDARIO PRINCIPAL
// ======================================================================

const monthLabel =
  document.getElementById("monthLabel");

const calendarGrid =
  document.getElementById("calendarGrid");

const bestDateCard =
  document.getElementById("bestDateCard");

const bestDateValue =
  document.getElementById("bestDateValue");

const bestDateSub =
  document.getElementById("bestDateSub");

const participantsList =
  document.getElementById("participantsList");

const participantsCount =
  document.getElementById("participantsCount");

const prevMonthBtn =
  document.getElementById("prevMonth");

const nextMonthBtn =
  document.getElementById("nextMonth");


prevMonthBtn.addEventListener(
  "click",
  () => changeMonth(-1)
);

nextMonthBtn.addEventListener(
  "click",
  () => changeMonth(1)
);


function changeMonth(delta) {
  let newMonth = viewMonth + delta;
  let newYear = viewYear;

  if (newMonth < 0) {
    newMonth = 11;
    newYear--;
  }

  if (newMonth > 11) {
    newMonth = 0;
    newYear++;
  }

  if (!monthHasRange(newYear, newMonth)) {
    return;
  }

  viewMonth = newMonth;
  viewYear = newYear;

  loadMonthData();
}


function updateMainNavigation() {
  let prevYear = viewYear;
  let prevMonth = viewMonth - 1;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear--;
  }

  let nextYear = viewYear;
  let nextMonth = viewMonth + 1;

  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }

  prevMonthBtn.disabled =
    !monthHasRange(prevYear, prevMonth);

  nextMonthBtn.disabled =
    !monthHasRange(nextYear, nextMonth);
}


async function loadMonthData() {
  if (!currentEventId) return;

  const token = ++monthLoadToken;

  monthLabel.textContent =
    `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  calendarGrid.innerHTML = "";

  updateMainNavigation();

  if (!sb) {
    calendarGrid.innerHTML = `
      <div style="grid-column:1/-1;color:var(--unavailable);font-size:13px;">
        Sin conexión a la base de datos.
      </div>
    `;

    return;
  }

  // Cargamos TODA la disponibilidad del evento.
  // Esto permite calcular la mejor fecha globalmente
  // y conocer todos los participantes aunque estemos
  // mirando otro mes.
  const { data, error } = await sb
    .from(AVAIL_TABLE)
    .select("person_name, date, status")
    .eq("event_id", currentEventId)
    .order("date", {
      ascending: true,
    });

  // Si mientras esperábamos se hizo otra petición,
  // ignoramos esta respuesta vieja.
  if (token !== monthLoadToken) {
    return;
  }

  if (error) {
    console.error(error);

    calendarGrid.innerHTML = `
      <div style="grid-column:1/-1;color:var(--unavailable);font-size:13px;">
        No se pudo cargar el calendario:
        ${escapeHtml(error.message)}
      </div>
    `;

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
      perDate[row.date].available.add(
        row.person_name
      );
    } else {
      perDate[row.date].unavailable.add(
        row.person_name
      );
    }
  });

  renderMainGrid(perDate);
  renderBestDate(perDate);
  renderParticipants(people);
}


// ======================================================================
// 9) GRID PRINCIPAL
// ======================================================================

function renderMainGrid(perDate) {
  const cells = buildCalendarCells(
    viewYear,
    viewMonth
  );

  let maxAvail = 0;

  Object.entries(perDate).forEach(
    ([date, info]) => {
      if (!isDateInRange(date)) return;

      if (info.available.size > maxAvail) {
        maxAvail = info.available.size;
      }
    }
  );

  cells.forEach((d) => {
    const cell =
      document.createElement("div");

    if (d === null) {
      cell.className =
        "day-cell empty";

      calendarGrid.appendChild(cell);
      return;
    }

    const key = dateKey(
      viewYear,
      viewMonth,
      d
    );

    const info = perDate[key];

    cell.className = "day-cell";

    const num =
      document.createElement("span");

    num.textContent = d;

    cell.appendChild(num);

    // Fecha fuera del rango del evento.
    if (!isDateInRange(key)) {
      cell.classList.add(
        "day-outside-range"
      );

      cell.title =
        "Fecha fuera del rango del evento";

      calendarGrid.appendChild(cell);

      return;
    }

    if (info) {
      const availCount =
        info.available.size;

      const unavailCount =
        info.unavailable.size;

      cell.classList.add("has-data");

      if (unavailCount > availCount) {
        cell.classList.add(
          "mostly-unavailable"
        );
      }

      if (
        maxAvail > 0 &&
        availCount === maxAvail
      ) {
        cell.classList.add("best-day");
      }

      const bar =
        document.createElement("div");

      bar.className = "count-bar";

      cell.appendChild(bar);

      cell.title =
        `${availCount} disponible(s), ` +
        `${unavailCount} no disponible(s)`;

    } else {
      const bar =
        document.createElement("div");

      bar.className = "count-bar";

      cell.appendChild(bar);

      cell.title =
        "Haz clic para ver quién respondió";
    }

    // Ahora cada fecha es clickeable.
    cell.classList.add(
      "date-detail-clickable"
    );

    cell.addEventListener("click", () => {
      openDateModal(
        key,
        info
      );
    });

    calendarGrid.appendChild(cell);
  });
}


// ======================================================================
// 10) MEJOR FECHA GLOBAL DEL EVENTO
// ======================================================================

function renderBestDate(perDate) {
  let best = null;

  Object.entries(perDate).forEach(
    ([date, info]) => {
      if (!isDateInRange(date)) {
        return;
      }

      const score =
        info.available.size;

      if (score === 0) {
        return;
      }

      if (
        !best ||
        score > best.score ||
        (
          score === best.score &&
          info.unavailable.size <
            best.unavailableCount
        )
      ) {
        best = {
          date,
          score,
          unavailableCount:
            info.unavailable.size,
        };
      }
    }
  );

  if (!best) {
    bestDateCard.classList.add(
      "hidden"
    );

    return;
  }

  bestDateCard.classList.remove(
    "hidden"
  );

  bestDateValue.textContent =
    formatDateLong(best.date);

  bestDateSub.textContent =
    `${best.score} amigo(s) disponible(s)` +
    (
      best.unavailableCount > 0
        ? ` · ${best.unavailableCount} no puede(n)`
        : ""
    );
}


// ======================================================================
// 11) PARTICIPANTES
// ======================================================================

function renderParticipants(peopleSet) {
  const people = Array.from(
    peopleSet
  ).sort((a, b) =>
    a.localeCompare(b)
  );

  participantsCount.textContent =
    people.length;

  if (people.length === 0) {
    participantsList.innerHTML = `
      <span class="empty-hint">
        Nadie ha marcado su disponibilidad todavía.
        ¡Sé el primero!
      </span>
    `;

    return;
  }

  participantsList.innerHTML = "";

  people.forEach((name) => {
    const chip =
      document.createElement("button");

    chip.className =
      "participant-chip";

    chip.textContent = name;

    chip.addEventListener(
      "click",
      () => openPersonModal(name)
    );

    participantsList.appendChild(
      chip
    );
  });
}


// ======================================================================
// 12) MODAL DE PERSONA
// ======================================================================

const personModalOverlay =
  document.getElementById(
    "personModalOverlay"
  );

const personModalName =
  document.getElementById(
    "personModalName"
  );

const personModalBody =
  document.getElementById(
    "personModalBody"
  );

const deletePersonAvailabilityBtn =
  document.getElementById(
    "deletePersonAvailabilityBtn"
  );


document
  .getElementById("closePersonModal")
  .addEventListener("click", () => {
    personModalOverlay.classList.add(
      "hidden"
    );
  });


personModalOverlay.addEventListener(
  "click",
  (e) => {
    if (
      e.target ===
      personModalOverlay
    ) {
      personModalOverlay.classList.add(
        "hidden"
      );
    }
  }
);


async function openPersonModal(name) {
  if (!sb || !currentEventId) {
    return;
  }

  personModalName.textContent =
    name;

  personModalBody.innerHTML = `
    <p class="empty-hint">
      Cargando...
    </p>
  `;

  deletePersonAvailabilityBtn.classList.remove(
    "hidden"
  );

  deletePersonAvailabilityBtn.dataset.person =
    name;

  personModalOverlay.classList.remove(
    "hidden"
  );

  const { data, error } = await sb
    .from(AVAIL_TABLE)
    .select("date, status")
    .eq("event_id", currentEventId)
    .eq("person_name", name)
    .order("date", {
      ascending: true,
    });

  if (error || !data) {
    personModalBody.innerHTML = `
      <p class="empty-hint">
        No se pudo cargar su disponibilidad.
      </p>
    `;

    return;
  }

  const available =
    data.filter(
      (r) => r.status === "available"
    );

  const unavailable =
    data.filter(
      (r) => r.status === "unavailable"
    );

  let html = "";

  if (available.length > 0) {
    html += `
      <div class="person-date-group">
        <div class="person-date-group-title txt-available">
          Disponible (${available.length})
        </div>

        ${available
          .map(
            (r) =>
              `<span class="person-date-chip available">
                ${formatDateShort(r.date)}
              </span>`
          )
          .join("")}
      </div>
    `;
  }

  if (unavailable.length > 0) {
    html += `
      <div class="person-date-group">
        <div class="person-date-group-title txt-unavailable">
          No disponible (${unavailable.length})
        </div>

        ${unavailable
          .map(
            (r) =>
              `<span class="person-date-chip unavailable">
                ${formatDateShort(r.date)}
              </span>`
          )
          .join("")}
      </div>
    `;
  }

  if (!html) {
    html = `
      <p class="empty-hint">
        Todavía no marcó ninguna fecha.
      </p>
    `;
  }

  personModalBody.innerHTML =
    html;
}


deletePersonAvailabilityBtn.addEventListener(
  "click",
  async () => {
    const name =
      deletePersonAvailabilityBtn.dataset
        .person;

    if (!name || !currentEventId) {
      return;
    }

    const confirmed = confirm(
      `¿Eliminar toda la disponibilidad de ${name}?\n\n` +
        "Se borrarán todas sus fechas de este evento."
    );

    if (!confirmed) {
      return;
    }

    deletePersonAvailabilityBtn.disabled =
      true;

    deletePersonAvailabilityBtn.textContent =
      "Eliminando...";

    const { error } = await sb
      .from(AVAIL_TABLE)
      .delete()
      .eq("event_id", currentEventId)
      .eq("person_name", name);

    deletePersonAvailabilityBtn.disabled =
      false;

    deletePersonAvailabilityBtn.textContent =
      "Eliminar disponibilidad";

    if (error) {
      console.error(error);

      alert(
        "No se pudo eliminar:\n" +
          error.message
      );

      return;
    }

    personModalOverlay.classList.add(
      "hidden"
    );

    await loadMonthData();
  }
);


// ======================================================================
// 13) MODAL DE FECHA
// ======================================================================

const dateModalOverlay =
  document.getElementById(
    "dateModalOverlay"
  );

const dateModalTitle =
  document.getElementById(
    "dateModalTitle"
  );

const dateModalBody =
  document.getElementById(
    "dateModalBody"
  );


document
  .getElementById("closeDateModal")
  .addEventListener("click", () => {
    dateModalOverlay.classList.add(
      "hidden"
    );
  });


dateModalOverlay.addEventListener(
  "click",
  (e) => {
    if (
      e.target ===
      dateModalOverlay
    ) {
      dateModalOverlay.classList.add(
        "hidden"
      );
    }
  }
);


async function openDateModal(
  date,
  info
) {
  if (!sb || !currentEventId) {
    return;
  }

  dateModalTitle.textContent =
    formatDateLong(date);

  dateModalBody.innerHTML = `
    <p class="empty-hint">
      Cargando...
    </p>
  `;

  dateModalOverlay.classList.remove(
    "hidden"
  );

  // Todos los participantes del evento.
  const { data, error } = await sb
    .from(AVAIL_TABLE)
    .select("person_name, date, status")
    .eq("event_id", currentEventId);

  if (error) {
    dateModalBody.innerHTML = `
      <p class="empty-hint">
        No se pudo cargar la información.
      </p>
    `;

    return;
  }

  const people = new Set();

  (data || []).forEach((row) => {
    people.add(row.person_name);
  });

  const available = new Set();
  const unavailable = new Set();

  (data || []).forEach((row) => {
    if (row.date !== date) {
      return;
    }

    if (row.status === "available") {
      available.add(row.person_name);
    } else {
      unavailable.add(row.person_name);
    }
  });

  // Si info existe también nos aseguramos
  // de tener los datos correctos.
  if (info) {
    info.available.forEach((name) =>
      available.add(name)
    );

    info.unavailable.forEach((name) =>
      unavailable.add(name)
    );
  }

  const noResponse = Array.from(
    people
  ).filter(
    (name) =>
      !available.has(name) &&
      !unavailable.has(name)
  );

  let html = "";

  html += `
    <div class="date-summary">
      <div class="date-summary-number">
        ${available.size}
      </div>
      <div>
        <strong>disponible(s)</strong>
      </div>
    </div>
  `;

  html += `
    <div class="date-person-group">
      <div class="person-date-group-title txt-available">
        Puede(n) (${available.size})
      </div>

      ${
        available.size
          ? Array.from(available)
              .sort((a, b) =>
                a.localeCompare(b)
              )
              .map(
                (name) =>
                  `<span class="date-person-chip available">
                    ${escapeHtml(name)}
                  </span>`
              )
              .join("")
          : `<span class="empty-hint">Nadie</span>`
      }
    </div>
  `;

  html += `
    <div class="date-person-group">
      <div class="person-date-group-title txt-unavailable">
        No puede(n) (${unavailable.size})
      </div>

      ${
        unavailable.size
          ? Array.from(unavailable)
              .sort((a, b) =>
                a.localeCompare(b)
              )
              .map(
                (name) =>
                  `<span class="date-person-chip unavailable">
                    ${escapeHtml(name)}
                  </span>`
              )
              .join("")
          : `<span class="empty-hint">Nadie</span>`
      }
    </div>
  `;

  html += `
    <div class="date-person-group">
      <div class="person-date-group-title">
        Sin responder (${noResponse.length})
      </div>

      ${
        noResponse.length
          ? noResponse
              .sort((a, b) =>
                a.localeCompare(b)
              )
              .map(
                (name) =>
                  `<span class="date-person-chip">
                    ${escapeHtml(name)}
                  </span>`
              )
              .join("")
          : `<span class="empty-hint">Nadie</span>`
      }
    </div>
  `;

  if (people.size === 0) {
    html = `
      <p class="empty-hint">
        Todavía nadie ha respondido al evento.
      </p>
    `;
  }

  dateModalBody.innerHTML =
    html;
}


// ======================================================================
// 14) MODAL: AÑADIR DISPONIBILIDAD
// ======================================================================

const modalOverlay =
  document.getElementById(
    "modalOverlay"
  );

const closeBtn =
  document.getElementById(
    "closeModal"
  );

const nameInput =
  document.getElementById(
    "nameInput"
  );

const modalMonthLabel =
  document.getElementById(
    "modalMonthLabel"
  );

const modalCalendarGrid =
  document.getElementById(
    "modalCalendarGrid"
  );

const saveBtn =
  document.getElementById(
    "saveAvailability"
  );

const saveStatus =
  document.getElementById(
    "saveStatus"
  );

const modalPrevMonth =
  document.getElementById(
    "modalPrevMonth"
  );

const modalNextMonth =
  document.getElementById(
    "modalNextMonth"
  );


openAddAvailabilityBtn.addEventListener(
  "click",
  () => {
    modalYear = viewYear;
    modalMonth = viewMonth;

    modalOverlay.classList.remove(
      "hidden"
    );

    renderModalGrid();

    if (nameInput.value.trim()) {
      loadExistingSelections();
    }
  }
);


closeBtn.addEventListener(
  "click",
  () => {
    modalOverlay.classList.add(
      "hidden"
    );
  }
);


modalOverlay.addEventListener(
  "click",
  (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.add(
        "hidden"
      );
    }
  }
);


modalPrevMonth.addEventListener(
  "click",
  () => {
    modalChangeMonth(-1);
  }
);


modalNextMonth.addEventListener(
  "click",
  () => {
    modalChangeMonth(1);
  }
);


function updateModalNavigation() {
  let prevYear = modalYear;
  let prevMonth = modalMonth - 1;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear--;
  }

  let nextYear = modalYear;
  let nextMonth = modalMonth + 1;

  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }

  modalPrevMonth.disabled =
    !monthHasRange(
      prevYear,
      prevMonth
    );

  modalNextMonth.disabled =
    !monthHasRange(
      nextYear,
      nextMonth
    );
}


function modalChangeMonth(delta) {
  let newMonth = modalMonth + delta;
  let newYear = modalYear;

  if (newMonth < 0) {
    newMonth = 11;
    newYear--;
  }

  if (newMonth > 11) {
    newMonth = 0;
    newYear++;
  }

  if (!monthHasRange(newYear, newMonth)) {
    return;
  }

  modalMonth = newMonth;
  modalYear = newYear;

  renderModalGrid();
}


nameInput.addEventListener(
  "blur",
  () => {
    if (nameInput.value.trim()) {
      loadExistingSelections();
    }
  }
);


async function loadExistingSelections() {
  if (!sb || !currentEventId) {
    return;
  }

  currentPersonName =
    nameInput.value.trim();

  if (!currentPersonName) {
    return;
  }

  const { data, error } = await sb
    .from(AVAIL_TABLE)
    .select("date, status")
    .eq("event_id", currentEventId)
    .eq(
      "person_name",
      currentPersonName
    );

  if (error) {
    console.error(error);
    return;
  }

  mySelections = {};

  (data || []).forEach((row) => {
    mySelections[row.date] =
      row.status;
  });

  renderModalGrid();
}


function renderModalGrid() {
  modalMonthLabel.textContent =
    `${MONTH_NAMES[modalMonth]} ${modalYear}`;

  modalCalendarGrid.innerHTML = "";

  updateModalNavigation();

  const cells = buildCalendarCells(
    modalYear,
    modalMonth
  );

  cells.forEach((d) => {
    const cell =
      document.createElement("div");

    if (d === null) {
      cell.className =
        "day-cell empty";

      modalCalendarGrid.appendChild(
        cell
      );

      return;
    }

    const key = dateKey(
      modalYear,
      modalMonth,
      d
    );

    const inRange =
      isDateInRange(key);

    cell.className =
      "day-cell clickable";

    const state =
      mySelections[key];

    if (state === "available") {
      cell.classList.add(
        "state-available"
      );
    }

    if (state === "unavailable") {
      cell.classList.add(
        "state-unavailable"
      );
    }

    cell.textContent = d;

    if (!inRange) {
      cell.classList.add(
        "day-outside-range"
      );

      cell.classList.remove(
        "clickable"
      );

      cell.title =
        "Fecha fuera del rango del evento";

      modalCalendarGrid.appendChild(
        cell
      );

      return;
    }

    cell.addEventListener(
      "click",
      () => {
        const cur =
          mySelections[key];

        if (!cur) {
          mySelections[key] =
            "available";
        } else if (
          cur === "available"
        ) {
          mySelections[key] =
            "unavailable";
        } else {
          delete mySelections[key];
        }

        renderModalGrid();
      }
    );

    modalCalendarGrid.appendChild(
      cell
    );
  });
}


// ======================================================================
// 15) GUARDAR DISPONIBILIDAD
// ======================================================================

saveBtn.addEventListener(
  "click",
  async () => {
    if (!sb) {
      saveStatus.textContent =
        "No hay conexión a la base de datos.";

      saveStatus.className =
        "save-status error";

      return;
    }

    const name =
      nameInput.value.trim();

    if (!name) {
      saveStatus.textContent =
        "Escribe tu nombre antes de guardar.";

      saveStatus.className =
        "save-status error";

      return;
    }

    // Seguridad adicional:
    // jamás guardar fechas fuera del rango.
    const validSelections =
      Object.entries(mySelections)
        .filter(([date]) =>
          isDateInRange(date)
        );

    saveBtn.disabled = true;

    saveStatus.textContent =
      "Guardando...";

    saveStatus.className =
      "save-status";

    const { error: delError } =
      await sb
        .from(AVAIL_TABLE)
        .delete()
        .eq(
          "event_id",
          currentEventId
        )
        .eq(
          "person_name",
          name
        );

    if (delError) {
      console.error(delError);

      saveStatus.textContent =
        "Error al guardar: " +
        delError.message;

      saveStatus.className =
        "save-status error";

      saveBtn.disabled = false;

      return;
    }

    const rows =
      validSelections.map(
        ([date, status]) => ({
          event_id:
            currentEventId,
          person_name:
            name,
          date,
          status,
        })
      );

    if (rows.length > 0) {
      const { error: insError } =
        await sb
          .from(AVAIL_TABLE)
          .insert(rows);

      if (insError) {
        console.error(insError);

        saveStatus.textContent =
          "Error al guardar: " +
          insError.message;

        saveStatus.className =
          "save-status error";

        saveBtn.disabled = false;

        return;
      }
    }

    saveStatus.textContent =
      "¡Disponibilidad guardada!";

    saveStatus.className =
      "save-status success";

    saveBtn.disabled = false;

    await loadMonthData();

    setTimeout(() => {
      modalOverlay.classList.add(
        "hidden"
      );

      saveStatus.textContent = "";
    }, 900);
  }
);


// ======================================================================
// 16) INICIO
// ======================================================================

(function init() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const eventIdFromUrl =
    params.get("event");

  if (
    eventIdFromUrl &&
    sb
  ) {
    sb
      .from(EVENTS_TABLE)
      .select(
        "id, name, start_date, end_date"
      )
      .eq(
        "id",
        eventIdFromUrl
      )
      .single()
      .then(
        ({
          data,
          error,
        }) => {
          if (
            data &&
            !error
          ) {
            showEventScreen(
              data.id,
              data.name,
              data.start_date,
              data.end_date
            );
          } else {
            showEventsScreen();
          }
        }
      );
  } else {
    showEventsScreen();
  }
})();