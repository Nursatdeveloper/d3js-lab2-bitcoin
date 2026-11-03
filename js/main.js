// Лабораторная работа №2: интерактивная визуализация данных с помощью D3.js
// (основа — лабораторная работа №1: загрузка CSV, столбчатая диаграмма, линейный график)

const DATA_URL = "data/bitcoin_monthly.csv";

// Описание числовых показателей: подпись, единицы измерения и формат вывода
const METRICS = {
  price_usd:            { label: "Средняя цена BTC",           unit: "USD",  format: d3.format("$,.0f") },
  transactions_per_day: { label: "Транзакций в сутки",          unit: "шт.",  format: d3.format(",.0f") },
  hash_rate_ehs:        { label: "Хешрейт сети",               unit: "EH/s", format: d3.format(",.0f") },
  avg_block_size_mb:    { label: "Средний размер блока",       unit: "МБ",   format: d3.format(".2f") },
  fees_usd_per_day:     { label: "Комиссии майнерам в сутки",  unit: "USD",  format: d3.format("$,.0f") }
};

// Халвинги Bitcoin: после каждого награда за блок уменьшается вдвое
const HALVINGS = [
  { date: new Date(2020, 4, 11), label: "Халвинг 2020" },
  { date: new Date(2024, 3, 20), label: "Халвинг 2024" }
];
const REWARDS = [12.5, 6.25, 3.125]; // до первого халвинга, между ними, после второго

const parseMonth = d3.timeParse("%Y-%m");
const formatMonth = d3.timeFormat("%m.%Y");
const formatChange = d3.format("+.1%");

const state = { data: [], metric: "price_usd", yearFrom: null, yearTo: null };
const tooltip = d3.select("#tooltip");

// Связь между графиками: наведение на один график подсвечивает тот же год на другом.
// Функции заполняются при каждой перерисовке соответствующего графика.
const linked = { highlightBar: () => {}, highlightLineYear: () => {} };

// ---------- 1. Загрузка и обработка данных ----------

// Функция преобразования строки CSV: все значения в CSV — строки,
// поэтому числовые столбцы приводим к Number, а месяц — к Date
function convertRow(d) {
  return {
    month: parseMonth(d.month),
    price_usd: +d.price_usd,
    transactions_per_day: +d.transactions_per_day,
    hash_rate_ehs: +d.hash_rate_ehs,
    avg_block_size_mb: +d.avg_block_size_mb,
    fees_usd_per_day: +d.fees_usd_per_day
  };
}

// Награда за блок в данном месяце — категориальный параметр записи
function blockReward(month) {
  const mid = new Date(month.getFullYear(), month.getMonth(), 15);
  return REWARDS[HALVINGS.filter(h => mid >= h.date).length];
}

d3.csv(DATA_URL, convertRow)
  .then(data => {
    // Отбрасываем строки с некорректной датой или нечисловыми значениями
    const valid = data.filter(d => d.month && Object.keys(METRICS).every(k => Number.isFinite(d[k])));
    if (valid.length === 0) {
      throw new Error("Файл загружен, но не содержит корректных записей.");
    }
    valid.sort((a, b) => a.month - b.month);
    valid.forEach((d, i) => {
      d.index = i;                    // позиция в полном наборе — для сравнения с прошлым месяцем
      d.reward = blockReward(d.month);
    });
    valid.columns = data.columns;
    state.data = valid;

    showDataInfo(valid, data.length - valid.length);
    setupControls(valid);
    renderAll();
    window.addEventListener("resize", debounce(renderAll, 150));
  })
  .catch(error => {
    // Ошибка сети, отсутствующий файл или некорректные данные
    console.error(error);
    const hint = location.protocol === "file:"
      ? "<br>Страница открыта как локальный файл (file://). Браузер блокирует загрузку CSV — запустите локальный сервер (см. README.md)."
      : "";
    d3.select("#status")
      .attr("class", "status status--error")
      .html(`Не удалось загрузить <code>${DATA_URL}</code>: ${error.message}${hint}`);
  });

function showDataInfo(data, skipped) {
  const columns = data.columns;
  const status = `CSV-файл успешно загружен и обработан.` +
    (skipped > 0 ? ` Пропущено некорректных строк: ${skipped}.` : "");
  d3.select("#status").attr("class", "status status--ok").text(status);

  d3.select("#info-grid").attr("hidden", null);
  d3.select("#file-name").text(DATA_URL.split("/").pop());
  d3.select("#row-count").text(data.length);
  d3.select("#col-count").text(columns.length);
  const [min, max] = d3.extent(data, d => d.month);
  d3.select("#period").text(`${formatMonth(min)} — ${formatMonth(max)}`);

  d3.select("#columns-block").attr("hidden", null);
  d3.select("#columns")
    .selectAll("li")
    .data(columns)
    .join("li")
    .html(c => `${c} <span>${typeof data[0][c] === "number" ? "number" : "date"}</span>`);

  // Таблица первых 10 записей — видно, что значения уже числа
  const table = d3.select("#preview-table");
  table.append("thead").append("tr")
    .selectAll("th").data(columns).join("th").text(c => c);
  table.append("tbody")
    .selectAll("tr").data(data.slice(0, 10)).join("tr")
    .selectAll("td")
    .data(row => columns.map(c => c === "month" ? formatMonth(row.month) : row[c].toLocaleString("ru-RU")))
    .join("td").text(v => v);
  d3.select("#table-card").attr("hidden", null);
}

// ---------- 2. Элементы управления: выбор показателя и фильтр по годам ----------

function setupControls(data) {
  const years = Array.from(new Set(data.map(d => d.month.getFullYear()))).sort();
  state.yearFrom = years[0];
  state.yearTo = years[years.length - 1];

  d3.select("#metric-select")
    .selectAll("option")
    .data(Object.entries(METRICS))
    .join("option")
    .attr("value", ([key]) => key)
    .text(([, m]) => `${m.label}, ${m.unit}`);

  d3.select("#year-from").selectAll("option").data(years).join("option").attr("value", y => y).text(y => y);
  d3.select("#year-to").selectAll("option").data(years).join("option").attr("value", y => y).text(y => y);
  d3.select("#year-from").property("value", state.yearFrom);
  d3.select("#year-to").property("value", state.yearTo);

  d3.select("#metric-select").on("change", event => {
    state.metric = event.target.value;
    renderAll();
  });
  d3.select("#year-from").on("change", event => {
    state.yearFrom = +event.target.value;
    if (state.yearFrom > state.yearTo) {
      state.yearTo = state.yearFrom;
      d3.select("#year-to").property("value", state.yearTo);
    }
    renderAll();
  });
  d3.select("#year-to").on("change", event => {
    state.yearTo = +event.target.value;
    if (state.yearTo < state.yearFrom) {
      state.yearFrom = state.yearTo;
      d3.select("#year-from").property("value", state.yearFrom);
    }
    renderAll();
  });

  d3.selectAll("#controls, #viz-layout").attr("hidden", null);
}

function filteredData() {
  return state.data.filter(d => {
    const y = d.month.getFullYear();
    return y >= state.yearFrom && y <= state.yearTo;
  });
}

// Средние значения всех показателей по годам (по полному набору,
// чтобы у первого отфильтрованного года было с чем сравнить)
function yearlyStats() {
  return d3.rollups(
    state.data,
    rows => {
      const stats = { months: rows.length, rewards: Array.from(new Set(rows.map(d => d.reward))) };
      for (const key of Object.keys(METRICS)) {
        const min = d3.least(rows, d => d[key]);
        const max = d3.greatest(rows, d => d[key]);
        stats[key] = { mean: d3.mean(rows, d => d[key]), min: min[key], minMonth: min.month, max: max[key], maxMonth: max.month };
      }
      return stats;
    },
    d => d.month.getFullYear()
  ).map(([year, s]) => ({ year, ...s })).sort((a, b) => a.year - b.year);
}

function renderAll() {
  const data = filteredData();
  const m = METRICS[state.metric];
  const range = state.yearFrom === state.yearTo ? `${state.yearFrom}` : `${state.yearFrom}–${state.yearTo}`;

  d3.select("#bar-title").text(`${m.label} по годам (${range})`);
  d3.select("#bar-desc").text(
    `Каждый столбец — среднее значение показателя «${m.label}» за календарный год. ` +
    `При наведении: среднее, минимум и максимум за год, изменение к прошлому году и награда за блок.`
  );
  d3.select("#line-title").text(`${m.label} по месяцам (${range})`);
  d3.select("#line-desc").text(
    `Каждая точка — один месяц из набора данных. При наведении: значение, изменение к прошлому месяцу ` +
    `и награда за блок. Пунктиром отмечены халвинги — уменьшение награды вдвое.`
  );

  drawBarChart(data, m);
  drawLineChart(data, m);
  resetInfoPanel();
}

// ---------- 3. Визуализация 1: столбчатая диаграмма ----------

function drawBarChart(data, metric) {
  const container = d3.select("#bar-chart");
  container.selectAll("*").remove();
  const key = state.metric;

  const allYears = yearlyStats();
  const years = allYears.filter(d => d.year >= state.yearFrom && d.year <= state.yearTo);

  // Ширина берётся из контейнера; минимум 320px на случай, если он ещё не отрисован
  const width = Math.max(container.node().clientWidth, 320);
  const height = 360;
  const margin = { top: 24, right: 16, bottom: 48, left: 76 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `Столбчатая диаграмма: ${metric.label} по годам`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(years.map(d => d.year))
    .range([0, innerW])
    .padding(0.3);
  const y = d3.scaleLinear()
    .domain([0, d3.max(years, d => d[key].mean)])
    .nice()
    .range([innerH, 0]);

  // Сетка и оси
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")));

  // Подписи осей
  g.append("text").attr("class", "axis-label")
    .attr("x", innerW / 2).attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("Год");
  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2).attr("y", -58)
    .attr("text-anchor", "middle")
    .text(`${metric.label}, ${metric.unit}`);

  // Столбцы: верхние углы скруглены, нижние стоят на базовой линии
  const bars = g.append("g").attr("class", "bars");
  bars.selectAll("path.bar")
    .data(years)
    .join("path")
    .attr("class", "bar")
    .attr("d", d => roundedTopBar(x(d.year), y(d[key].mean), x.bandwidth(), innerH - y(d[key].mean), 4));

  // Подписи значений над столбцами
  bars.selectAll("text.bar-label")
    .data(years)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", d => x(d.year) + x.bandwidth() / 2)
    .attr("y", d => y(d[key].mean) - 6)
    .attr("text-anchor", "middle")
    .text(d => d3.format(".3~s")(d[key].mean));

  // Подсветка столбца: выбранный остаётся ярким, остальные становятся полупрозрачными
  linked.highlightBar = year => {
    bars.classed("is-hovering", year != null);
    bars.selectAll("path.bar").classed("is-active", b => b.year === year);
    bars.selectAll("text.bar-label").classed("is-active", b => b.year === year);
  };

  // Невидимые прямоугольники на всю высоту — увеличенная зона наведения
  bars.selectAll("rect.bar-hit")
    .data(years)
    .join("rect")
    .attr("class", "bar-hit")
    .attr("x", d => x(d.year) - (x.step() - x.bandwidth()) / 2)
    .attr("width", x.step())
    .attr("y", 0)
    .attr("height", innerH)
    .on("mouseenter", (event, d) => {
      linked.highlightBar(d.year);
      linked.highlightLineYear(d.year);
      showYearInfo(d, allYears);
    })
    .on("mousemove", (event, d) => {
      const s = d[key];
      const prev = allYears.find(p => p.year === d.year - 1);
      showTooltip(event,
        `<strong>${d.year} год</strong>` +
        row("Среднее", valueText(s.mean, metric)) +
        row("Минимум", `${valueText(s.min, metric)} <span class="muted">(${formatMonth(s.minMonth)})</span>`) +
        row("Максимум", `${valueText(s.max, metric)} <span class="muted">(${formatMonth(s.maxMonth)})</span>`) +
        row("К прошлому году", prev ? changeText(s.mean, prev[key].mean) : "—") +
        row("Награда за блок", d.rewards.map(r => `${r} BTC`).join(" → ")) +
        `<span class="muted">Данные за ${d.months} мес.</span>`);
    })
    .on("mouseleave", () => {
      linked.highlightBar(null);
      linked.highlightLineYear(null);
      hideTooltip();
    });
}

function roundedTopBar(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ---------- 4. Визуализация 2: линейный график с точками ----------

function drawLineChart(data, metric) {
  const container = d3.select("#line-chart");
  container.selectAll("*").remove();

  const width = Math.max(container.node().clientWidth, 320);
  const height = 360;
  const margin = { top: 24, right: 16, bottom: 48, left: 76 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const key = state.metric;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `Линейный график: ${metric.label} по месяцам`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime()
    .domain(d3.extent(data, d => d.month))
    .range([0, innerW]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[key])])
    .nice()
    .range([innerH, 0]);

  // Полоса подсветки года (при наведении на столбец) — рисуется под графиком
  const yearBand = g.append("rect")
    .attr("class", "year-band")
    .attr("y", 0).attr("height", innerH)
    .style("display", "none");

  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(innerW / 90))).tickFormat(d3.timeFormat("%m.%Y")).tickSizeOuter(0));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")));

  g.append("text").attr("class", "axis-label")
    .attr("x", innerW / 2).attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("Месяц");
  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2).attr("y", -58)
    .attr("text-anchor", "middle")
    .text(`${metric.label}, ${metric.unit}`);

  // Для одного месяца линию построить нельзя
  if (data.length < 2) {
    linked.highlightLineYear = () => {};
    g.append("text").attr("class", "empty")
      .attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
      .text("Недостаточно точек для построения линии");
    return;
  }

  // Отметки халвингов, попадающих в выбранный период
  const [start, end] = x.domain();
  const events = HALVINGS.filter(e => e.date >= start && e.date <= end);
  const annot = g.append("g");
  annot.selectAll("line").data(events).join("line")
    .attr("class", "annot-line")
    .attr("x1", e => x(e.date)).attr("x2", e => x(e.date))
    .attr("y1", 0).attr("y2", innerH);
  annot.selectAll("text").data(events).join("text")
    .attr("class", "annot-text")
    .attr("x", e => x(e.date) + 4).attr("y", 10)
    .text(e => e.label);

  // Область под линией и сама линия
  g.append("path").datum(data)
    .attr("class", "area")
    .attr("d", d3.area().x(d => x(d.month)).y0(innerH).y1(d => y(d[key])).curve(d3.curveMonotoneX));
  g.append("path").datum(data)
    .attr("class", "line")
    .attr("d", d3.line().x(d => x(d.month)).y(d => y(d[key])).curve(d3.curveMonotoneX));

  // Точка для каждой записи (месяца)
  const focusLine = g.append("line").attr("class", "focus-line")
    .attr("y1", 0).attr("y2", innerH).style("display", "none");
  const dots = g.append("g").attr("class", "dots")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("class", "dot")
    .attr("cx", d => x(d.month))
    .attr("cy", d => y(d[key]))
    .attr("r", 3);

  linked.highlightLineYear = year => {
    if (year == null) {
      yearBand.style("display", "none");
      return;
    }
    const x0 = x(Math.max(new Date(year, 0, 1), start));
    const x1 = x(Math.min(new Date(year, 11, 31), end));
    yearBand.style("display", null).attr("x", x0).attr("width", Math.max(x1 - x0, 2));
  };

  // Наведение: ближайшая к курсору точка увеличивается, остальные бледнеют
  const bisect = d3.bisector(d => d.month).center;
  let current = null;
  g.append("rect")
    .attr("width", innerW).attr("height", innerH)
    .attr("fill", "transparent")
    .on("mousemove", event => {
      const [mx] = d3.pointer(event);
      const d = data[bisect(data, x.invert(mx))];
      if (d !== current) {
        current = d;
        dots.classed("is-active", p => p === d)
          .attr("r", p => p === d ? 7 : 3);
        g.select(".dots").classed("is-hovering", true);
        focusLine.style("display", null).attr("x1", x(d.month)).attr("x2", x(d.month));
        linked.highlightBar(d.month.getFullYear());
        showMonthInfo(d);
      }
      const prev = state.data[d.index - 1];
      showTooltip(event,
        `<strong>${monthName(d.month)}</strong>` +
        row(metric.label, valueText(d[key], metric)) +
        row("К прошлому месяцу", prev ? changeText(d[key], prev[key]) : "—") +
        row("Награда за блок", `${d.reward} BTC`) +
        (key === "price_usd" ? "" : row("Цена BTC", METRICS.price_usd.format(d.price_usd))));
    })
    .on("mouseleave", () => {
      current = null;
      dots.classed("is-active", false).attr("r", 3);
      g.select(".dots").classed("is-hovering", false);
      focusLine.style("display", "none");
      linked.highlightBar(null);
      hideTooltip();
    });
}

// ---------- 5. Информационный блок «Подробно о записи» ----------

function resetInfoPanel() {
  d3.select("#info-title").text("Подробно о записи");
  d3.select("#info-subtitle").text("Наведите курсор на столбец или точку графика — здесь появятся все показатели выбранной записи.");
  d3.select("#info-list").selectAll("*").remove();
}

// Все показатели одного месяца
function showMonthInfo(d) {
  d3.select("#info-title").text(monthName(d.month));
  d3.select("#info-subtitle").text(`Запись №${d.index + 1} из ${state.data.length} · награда за блок ${d.reward} BTC`);
  fillInfoList(Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label, value: valueText(d[key], m) })));
}

// Средние значения всех показателей за год
function showYearInfo(year, allYears) {
  const prev = allYears.find(p => p.year === year.year - 1);
  d3.select("#info-title").text(`${year.year} год`);
  d3.select("#info-subtitle").text(`Средние значения за ${year.months} мес. · награда ${year.rewards.map(r => `${r} BTC`).join(" → ")}`);
  fillInfoList(Object.entries(METRICS).map(([key, m]) => ({
    key,
    label: m.label,
    value: valueText(year[key].mean, m),
    note: prev ? changeText(year[key].mean, prev[key].mean) + " к пред. году" : null
  })));
}

function fillInfoList(items) {
  d3.select("#info-list")
    .selectAll("div")
    .data(items)
    .join("div")
    .attr("class", d => d.key === state.metric ? "info-row is-current" : "info-row")
    .html(d => `<dt>${d.label}</dt><dd>${d.value}${d.note ? `<span class="muted">${d.note}</span>` : ""}</dd>`);
}

// ---------- Вспомогательные функции ----------

function valueText(value, metric) {
  return metric.unit === "USD" ? metric.format(value) : `${metric.format(value)} ${metric.unit}`;
}

// Изменение в процентах со стрелкой — направление видно не только по знаку
function changeText(current, previous) {
  const change = (current - previous) / previous;
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "■";
  return `${arrow} ${formatChange(change)}`;
}

function monthName(date) {
  const s = date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function row(label, value) {
  return `<div class="tt-row"><span class="muted">${label}</span><span>${value}</span></div>`;
}

function showTooltip(event, html) {
  const node = tooltip.html(html).classed("is-visible", true).node();
  const { width, height } = node.getBoundingClientRect();
  let left = event.clientX + 14;
  let top = event.clientY - height - 10;
  if (left + width > window.innerWidth - 8) left = event.clientX - width - 14;
  if (top < 8) top = event.clientY + 16;
  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

function hideTooltip() {
  tooltip.classed("is-visible", false);
}

function debounce(fn, ms) {
  let t;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}
