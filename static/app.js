
/*
 * Mi Cultivo - Frontend
 * Consulta los datos del IoT Server y actualiza el dashboard.
 * Incluye autenticación de usuarios y control de sesiones.
 */

// ========================================
// 1. ELEMENTOS DEL HTML
// ========================================

const elements = {
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    loginForm: document.getElementById("login-form"),
    loginUsername: document.getElementById("login-username"),
    loginPassword: document.getElementById("login-password"),
    loginError: document.getElementById("login-error"),
    loginButton: document.getElementById("login-button"),

    currentUsername: document.getElementById("current-username"),
    currentFarm: document.getElementById("current-farm"),
    welcomeMessage: document.getElementById("welcome-message"),
    logoutButton: document.getElementById("logout-button"),

    serverStatus: document.getElementById("server-status"),
    systemMessage: document.getElementById("system-message"),

    nodeSelector: document.getElementById("node-selector"),
    metricsGrid: document.getElementById("metrics-grid"),
    allNodesContainer: document.getElementById("all-nodes-container"),

    soilMoisture: document.getElementById("soil-moisture"),
    soilUpdated: document.getElementById("soil-updated"),
    temperature: document.getElementById("temperature"),
    humidity: document.getElementById("humidity"),
    nodeId: document.getElementById("node-id"),

    recommendationTitle: document.getElementById("recommendation-title"),
    recommendationText: document.getElementById("recommendation-text"),


    historyTotal: document.getElementById("history-total"),
    historyAccepted: document.getElementById("history-accepted"),
    historyRejected: document.getElementById("history-rejected"),
    historyPending: document.getElementById("history-pending"),

    historyAcceptanceRate: document.getElementById(
        "history-acceptance-rate"
    ),

    historyFarmFilter: document.getElementById(
        "history-farm-filter"
    ),

    historyDecisionFilter: document.getElementById(
        "history-decision-filter"
    ),

    historyRefresh: document.getElementById("history-refresh"),
    historyMessage: document.getElementById("history-message"),
    historyList: document.getElementById("history-list"),
    historyPanel: document.getElementById("history-panel"),
    usersPanel: document.getElementById("users-panel"),
    accountPanel: document.getElementById("account-panel")
};

// ========================================
// 2. ESTADO DE LA APLICACIÓN
// ========================================

let isAuthenticated = false;
let refreshTimer = null;

// ========================================
// 3. CONTROL DE AUTENTICACIÓN
// ========================================

function showLogin(message = "") {
    
    isAuthenticated = false;

    activeDecisionForm = null;

    clearRecommendationHistory();

    resetAdminPanels();

    recommendationsRequestId++;

    elements.recommendationText.replaceChildren();
    elements.recommendationTitle.textContent =
        "Preparando el análisis";

    // Detenemos las actualizaciones automáticas.
    if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }

    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;

    elements.loginError.textContent = message;
    elements.loginError.hidden = !message;
}

function showDashboard(user) {
    isAuthenticated = true;

    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;

    elements.currentUsername.textContent = user.username;
    elements.currentFarm.textContent =
        user.farm_name || "Todas las fincas";
    // Cargar los datos de la cuenta del administrador.
    if (user.role === "admin") {
        loadAccountInformation(user.username);
    }

    if (elements.welcomeMessage) {
        elements.welcomeMessage.textContent =
            `¡Hola, ${user.username}!`;
    }

    // Mostrar u ocultar elementos exclusivos del administrador
    const adminElements = document.querySelectorAll(".admin-only");

    adminElements.forEach(element => {
        element.hidden = user.role !== "admin";
    });

    // Cargar usuarios si la sesión pertenece a un administrador
    if (user.role === "admin") {
        loadUsers();
    }
}

// Consultamos una API que requiere autenticación.
// Si la sesión venció, regresamos al inicio de sesión.

async function authenticatedFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin"
    });

    if (response.status === 401) {
        showLogin("Tu sesión ha expirado. Inicia sesión nuevamente.");
        throw new Error("SESSION_EXPIRED");
    }

    return response;
}

// Comprobamos si existe una sesión activa.

async function checkCurrentSession() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "same-origin"
        });

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            throw new Error("No se pudo verificar la sesión.");
        }

        const user = await response.json();

        showDashboard(user);
        await initializeDashboardData();

    } catch (error) {
        console.error("Error al verificar la sesión:", error);

        showLogin(
            "No fue posible conectar con el servidor. Inténtalo nuevamente."
        );
    }
}

// Procesamos el formulario de inicio de sesión.

async function login(event) {
    event.preventDefault();

    elements.loginError.hidden = true;
    elements.loginButton.disabled = true;
    elements.loginButton.textContent = "Ingresando...";

    const username = elements.loginUsername.value.trim();
    const password = elements.loginPassword.value;

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        if (!response.ok) {
            let message = "Usuario o contraseña incorrectos.";

            try {
                const data = await response.json();
                message = data.detail || message;
            } catch (error) {
                // Conservamos el mensaje predeterminado.
            }

            throw new Error(message);
        }

        // Consultamos los datos completos del usuario.
        const userResponse = await fetch("/api/auth/me", {
            credentials: "same-origin"
        });

        if (!userResponse.ok) {
            throw new Error(
                "No se pudieron obtener los datos de tu usuario."
            );
        }

        const user = await userResponse.json();

        elements.loginPassword.value = "";

        showDashboard(user);

        await initializeDashboardData();

    } catch (error) {
        console.error("Error al iniciar sesión:", error);

        showLogin(error.message);

    } finally {
        elements.loginButton.disabled = false;
        elements.loginButton.textContent = "Iniciar sesión";
    }
}

// Cerramos la sesión en el servidor.

async function logout() {
    elements.logoutButton.disabled = true;

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error("No se pudo cerrar la sesión correctamente.");
        }

        showLogin("Has cerrado sesión correctamente.");

    } catch (error) {
        console.error("Error al cerrar sesión:", error);

        showLogin(
            "Se cerró la vista del panel, pero no se pudo confirmar el cierre en el servidor."
        );

    } finally {
        elements.loginPassword.value = "";
        elements.logoutButton.disabled = false;
    }
}

// ========================================
// 4. FUNCIONES DEL DASHBOARD
// ========================================

// Actualizamos el valor de una tarjeta sin perder su unidad visual.

function setMetricValue(element, value, unit = "") {
    element.replaceChildren();

    const displayedValue =
        value === null || value === undefined ? "--" : value;

    element.appendChild(
        document.createTextNode(String(displayedValue))
    );

    if (unit) {
        const span = document.createElement("span");
        span.textContent = unit;
        element.appendChild(span);
    }
}

function showNoMeasurement() {
    setMetricValue(elements.soilMoisture, "--", "%");
    setMetricValue(elements.temperature, "--", "°C");
    setMetricValue(elements.humidity, "--", "%");

    elements.nodeId.textContent = "--";
    elements.soilUpdated.textContent = "Esperando primera medición";

    elements.recommendationTitle.textContent = "Aún no hay mediciones";
    elements.recommendationText.textContent =
        "Cuando este nodo envíe sus datos, podremos mostrar " +
        "información y recomendaciones para tu cultivo.";
}

// ========================================
// 5. ESTADO DEL SERVIDOR
// ========================================

async function checkServerStatus() {
    try {
        const response = await fetch("/api/status");

        if (!response.ok) {
            throw new Error("El servidor respondió con un error.");
        }

        const data = await response.json();

        elements.serverStatus.textContent =
            data.status === "online"
                ? "● Servidor conectado"
                : "● Servidor no disponible";

        elements.systemMessage.textContent =
            data.status === "online"
                ? "El servidor está funcionando correctamente."
                : "El servidor no está disponible.";

    } catch (error) {
        elements.serverStatus.textContent = "● Sin conexión";

        elements.systemMessage.textContent =
            "No fue posible comunicarse con el servidor.";
    }
}

// ========================================
// 6. CARGA DE NODOS
// ========================================

async function loadNodes() {
    try {
        const response = await authenticatedFetch("/api/nodes");

        if (!response.ok) {
            throw new Error("No se pudieron consultar los nodos.");
        }

        const nodes = await response.json();
        const previousSelection = elements.nodeSelector.value;

        elements.nodeSelector.replaceChildren();

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "Todas las fincas";
        elements.nodeSelector.appendChild(allOption);

        nodes.forEach((nodeId) => {
            const option = document.createElement("option");
            option.value = nodeId;
            option.textContent = getNodeDisplayName(nodeId);
            elements.nodeSelector.appendChild(option);
        });

        const selectionStillExists = Array.from(
            elements.nodeSelector.options
        ).some((option) => option.value === previousSelection);

        elements.nodeSelector.value = selectionStillExists
            ? previousSelection
            : "";

    } catch (error) {
        if (error.message !== "SESSION_EXPIRED" && isAuthenticated) {
            elements.systemMessage.textContent =
                "No fue posible cargar la lista de nodos.";
        }
    }
}

// ========================================
// 7. VISUALIZACIÓN DE MEDICIONES
// ========================================

function showMeasurement(data) {
    setMetricValue(
        elements.soilMoisture,
        data.soil_moisture_pct,
        "%"
    );

    setMetricValue(
        elements.temperature,
        data.temperature_c,
        "°C"
    );

    setMetricValue(
        elements.humidity,
        data.humidity_pct,
        "%"
    );

    elements.nodeId.textContent = getNodeDisplayName(data.node_id);

    const measurementDate = new Date(data.timestamp);

    elements.soilUpdated.textContent =
        `Registrada: ${measurementDate.toLocaleString("es-CO")}`;

}

// Consultamos la última medición de un nodo.

async function getLatestMeasurement(nodeId) {
    let url = "/api/measurements/latest";

    if (nodeId) {
        url += `?node_id=${encodeURIComponent(nodeId)}`;
    }

    const response = await authenticatedFetch(url);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error("No se pudo consultar la medición.");
    }

    return response.json();
}

// Cargamos las mediciones de un nodo seleccionado.

async function loadSelectedNode(nodeId) {
    elements.metricsGrid.hidden = false;
    elements.allNodesContainer.hidden = true;

    try {
        const measurement = await getLatestMeasurement(nodeId);

        if (!isAuthenticated) return;

        if (!measurement) {
            showNoMeasurement();
            return;
        }

        showMeasurement(measurement);

    } catch (error) {
        if (!isAuthenticated) return;

        elements.soilUpdated.textContent =
            "No fue posible cargar la medición.";

        elements.recommendationTitle.textContent =
            "Datos temporalmente no disponibles";

        elements.recommendationText.textContent =
            "Comprueba la conexión con el servidor e inténtalo de nuevo.";
    }
}

// ========================================
// 8. TARJETAS DE NODOS
// ========================================

// Nombres visibles de los nodos.

const NODE_DISPLAY_NAMES = {
    "ESP32_TEST": "Finca 01",
    "ESP32_TEST_02": "Finca 02",
    "ESP32C6_01": "Finca 03"
};

function getNodeDisplayName(nodeId) {

    return NODE_DISPLAY_NAMES[nodeId] || nodeId;
}

function createNodeCard(nodeId, measurement) {
    const card = document.createElement("article");
    card.className = "node-summary-card";

    const title = document.createElement("h3");
    title.textContent = getNodeDisplayName(nodeId);
    card.appendChild(title);

    if (!measurement) {
        const message = document.createElement("p");
        message.textContent = "Todavía no hay mediciones disponibles.";
        card.appendChild(message);
        return card;
    }

    const soil = document.createElement("p");
    soil.textContent = "Humedad del suelo: ";

    const soilValue = document.createElement("strong");
    soilValue.textContent =
        measurement.soil_moisture_pct == null
            ? "--"
            : `${measurement.soil_moisture_pct}%`;

    soil.appendChild(soilValue);
    card.appendChild(soil);

    const temperature = document.createElement("p");
    temperature.textContent = "Temperatura: ";

    const temperatureValue = document.createElement("strong");
    temperatureValue.textContent =
        measurement.temperature_c == null
            ? "--"
            : `${measurement.temperature_c} °C`;

    temperature.appendChild(temperatureValue);
    card.appendChild(temperature);

    const humidity = document.createElement("p");
    humidity.textContent = "Humedad ambiental: ";

    const humidityValue = document.createElement("strong");
    humidityValue.textContent =
        measurement.humidity_pct == null
            ? "--"
            : `${measurement.humidity_pct}%`;

    humidity.appendChild(humidityValue);
    card.appendChild(humidity);

    const updated = document.createElement("p");
    updated.className = "node-updated";

    updated.textContent =
        `Última medición: ${
            new Date(measurement.timestamp).toLocaleString("es-CO")
        }`;

    card.appendChild(updated);

    return card;
}

// ========================================
// 9. RESUMEN DE TODOS LOS NODOS
// ========================================

async function loadAllNodes() {
    elements.metricsGrid.hidden = true;
    elements.allNodesContainer.hidden = false;
    elements.allNodesContainer.replaceChildren();

    try {
        const response = await authenticatedFetch("/api/nodes");

        if (!response.ok) {
            throw new Error("No se pudieron consultar los nodos.");
        }

        const nodes = await response.json();
        nodes.sort((a, b) => getNodeDisplayName(a).localeCompare(getNodeDisplayName(b), "es",
                { numeric: true })
        );

        if (!isAuthenticated) return;

        if (nodes.length === 0) {
            const message = document.createElement("p");
            message.textContent =
                "Todavía no hay nodos con mediciones registradas.";

            elements.allNodesContainer.appendChild(message);
            return;
        }

        const measurements = await Promise.all(
            nodes.map(async (nodeId) => {
                try {
                    return await getLatestMeasurement(nodeId);
                } catch (error) {
                    return null;
                }
            })
        );

        if (!isAuthenticated) return;

        nodes.forEach((nodeId, index) => {
            const card = createNodeCard(nodeId, measurements[index]);
            elements.allNodesContainer.appendChild(card);
        });

    } catch (error) {
        if (!isAuthenticated) return;

        const message = document.createElement("p");
        message.textContent =
            "No fue posible cargar los datos de los nodos.";

        elements.allNodesContainer.appendChild(message);
    }
}

// ========================================
// 10. ACTUALIZACIÓN DEL DASHBOARD
// ========================================

// Recomendaciones: 

/* ========================================
   RECOMENDACIONES AGRICOLAS
======================================== */

// Evita mostrar respuestas antiguas
// cuando el usuario cambia de nodo.
let recommendationsRequestId = 0;
// Estado del formulario de decisión.
let activeDecisionForm = null;

// Evitar solicitudes simultáneas de decisiones.
let isSavingDecision = false;


async function registerRecommendationDecision(
    recommendationId,
    decision,
    reason = null
) {

    if (!isAuthenticated || isSavingDecision) {
        return;
    }

    if (decision === "rejected") {

        reason = (reason || "").trim();

        if (!reason || reason.length > 500) {
            return;
        }
    }

    isSavingDecision = true;

    const form = elements.recommendationText.querySelector(
        ".recommendation-decision-form"
    );

    const errorMessage = form?.querySelector(
        ".recommendation-form-error"
    );

    if (errorMessage) {
        errorMessage.textContent = "";
    }

    const controls = elements.recommendationText
        .querySelectorAll("button, textarea");

    controls.forEach(control => {
        control.disabled = true;
    });

    try {

        const response = await authenticatedFetch(
            `/api/recommendations/${recommendationId}/decision`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    decision: decision,
                    reason: reason
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : "No fue posible registrar la decisión."
            );
        }

        // Cerrar el formulario después de guardar.

        activeDecisionForm = null;
        isSavingDecision = false;

        if (!isAuthenticated) return;

        // Actualizar recomendaciones e historial.

        await loadRecommendations(
            elements.nodeSelector.value
        );

        await loadRecommendationHistory();

    } catch (error) {

        if (
            !isAuthenticated ||
            error.message === "SESSION_EXPIRED"
        ) {
            return;
        }

        if (errorMessage) {

            errorMessage.textContent = error.message;

        } else {

            console.error(
                "Error al registrar la decisión:",
                error
            );
        }

    } finally {

        isSavingDecision = false;

        controls.forEach(control => {
            control.disabled = false;
        });
    }
}


/* ========================================
   FORMULARIO DE DECISIONES
======================================== */

function showRecommendationDecisionForm(
    recommendation,
    decision,
    item,
    actions
) {

    if (!isAuthenticated || isSavingDecision) {
        return;
    }

    // No abrir varios formularios simultáneamente.

    if (activeDecisionForm !== null) {
        return;
    }

    activeDecisionForm = recommendation.id;

    // Invalidar consultas anteriores pendientes.
    recommendationsRequestId++;

    actions.hidden = true;

    const form = document.createElement("div");

    form.className = "recommendation-decision-form";

    const title = document.createElement("h4");

    title.textContent =
        decision === "rejected"
            ? "Motivo del rechazo"
            : "Confirmar aceptación";

    form.appendChild(title);

    const description = document.createElement("p");

    description.className = "decision-form-description";

    description.textContent =
        decision === "rejected"
            ? "Cuéntanos por qué consideras que esta " +
              "recomendación no es adecuada para tu cultivo."
            : "¿Estás de acuerdo con esta recomendación? " +
              "Esto no significa que la acción ya fue realizada.";

    form.appendChild(description);

    let reasonInput = null;

    // Crear el cajón de texto para el rechazo.

    if (decision === "rejected") {

        reasonInput = document.createElement("textarea");

        reasonInput.className =
            "recommendation-reason-input";

        reasonInput.placeholder =
            "Escribe aquí el motivo del rechazo...";

        reasonInput.rows = 4;
        reasonInput.maxLength = 500;
        reasonInput.required = true;

        reasonInput.setAttribute(
            "aria-label",
            "Motivo del rechazo"
        );

        form.appendChild(reasonInput);
    }

    // Mensajes de error.

    const errorMessage = document.createElement("p");

    errorMessage.className =
        "recommendation-form-error";

    errorMessage.setAttribute("role", "alert");

    form.appendChild(errorMessage);

    // Botones del formulario.

    const formActions = document.createElement("div");

    formActions.className = "recommendation-actions";

    const cancelButton = document.createElement("button");

    cancelButton.type = "button";

    cancelButton.className =
        "recommendation-cancel";

    cancelButton.textContent = "Cancelar";

    cancelButton.addEventListener("click", () => {

        if (isSavingDecision) return;

        activeDecisionForm = null;

        form.remove();

        actions.hidden = false;

        loadRecommendations(
            elements.nodeSelector.value
        );
    });

    const saveButton = document.createElement("button");

    saveButton.type = "button";

    saveButton.className =
        "recommendation-accept";

    saveButton.textContent =
        decision === "rejected"
            ? "Guardar rechazo"
            : "Confirmar aceptación";

    // Contador de caracteres y validación.

    if (reasonInput) {

        const counter = document.createElement("small");

        counter.className =
            "recommendation-character-counter";

        counter.textContent = "0 / 500 caracteres";

        form.insertBefore(counter, errorMessage);

        saveButton.disabled = true;

        reasonInput.addEventListener("input", () => {

            const length = reasonInput.value.length;

            counter.textContent =
                `${length} / 500 caracteres`;

            saveButton.disabled =
                !reasonInput.value.trim() ||
                length > 500;

        });
    }

    saveButton.addEventListener("click", async () => {

        if (isSavingDecision) return;

        const reason = reasonInput
            ? reasonInput.value.trim()
            : null;

        if (
            decision === "rejected" &&
            (!reason || reason.length > 500)
        ) {

            errorMessage.textContent =
                "Debes escribir un motivo válido.";

            return;
        }

        await registerRecommendationDecision(
            recommendation.id,
            decision,
            reason
        );

    });

    formActions.append(
        cancelButton,
        saveButton
    );

    form.appendChild(formActions);

    item.appendChild(form);

    if (reasonInput) {
        reasonInput.focus();
    }
}


async function loadRecommendations(nodeId) {

    if (!isAuthenticated) return;

    // No actualizar las recomendaciones mientras
    // el agricultor está registrando una decisión.

    if (activeDecisionForm !== null || isSavingDecision) {
        return;
    }

    const requestId = ++recommendationsRequestId;

    if (!elements.recommendationTitle || !elements.recommendationText) {
        return;
    }

    let url = "/api/recommendations";

    // Si se selecciona un nodo, consultar
    // solamente sus recomendaciones.
    // Si está vacío, consultar todos.
    if (nodeId) {
        url += `?node_id=${encodeURIComponent(nodeId)}`;
    }

    try {

        const response = await authenticatedFetch(url);

        if (!response.ok) {
            throw new Error(
                "No se pudieron consultar las recomendaciones."
            );
        }

        const data = await response.json();

        // Ignorar respuestas que ya no
        // corresponden a la selección actual
        // o si el usuario ha cerrado sesión.
        if (
            !isAuthenticated || requestId !== recommendationsRequestId || nodeId !== elements.nodeSelector.value
        ) {
            return;
        }

        const nodes = data.nodes || [];

        // Limpiar contenido anterior.
        elements.recommendationText.replaceChildren();

        // ==================================
        // 1. SIN NODOS REGISTRADOS
        // ==================================

        if (nodes.length === 0) {

            elements.recommendationTitle.textContent =
                "Sin nodos disponibles";

            elements.recommendationText.textContent =
                "Todavía no hay nodos registrados " +
                "para consultar recomendaciones.";

            return;
        }

        // ==================================
        // 2. REUNIR LAS RECOMENDACIONES
        // ==================================

        const recommendations = [];

        let staleCount = 0;
        let noDataCount = 0;
        let invalidCount = 0;

        nodes.forEach((node) => {

            if (node.status === "stale") {
                staleCount++;
                return;
            }

            if (node.status === "no_data") {
                noDataCount++;
                return;
            }

            if (node.status === "invalid_timestamp") {
                invalidCount++;
                return;
            }

            if (node.status === "evaluated") {

                (node.recommendations || []).forEach(
                    (recommendation) => {

                        recommendations.push({
                            ...recommendation,
                            node_id: node.node_id
                        });

                    }
                );
            }
        });

        // ==================================
        // 3. MOSTRAR RECOMENDACIONES
        // ==================================

        if (recommendations.length > 0) {

            elements.recommendationTitle.textContent =
                recommendations.length === 1
                    ? "1 recomendación agrícola"
                    : `${recommendations.length} recomendaciones agrícolas`;

            recommendations.forEach((recommendation) => {

                const item = document.createElement("div");
                item.className = "recommendation-item";

                const title = document.createElement("strong");
                title.className = "recommendation-item-title";
                title.textContent = recommendation.title;

                const message = document.createElement("p");
                message.textContent = recommendation.message;

                const details = document.createElement("small");
                details.className = "recommendation-item-details";

                const value = Number(recommendation.value);
                const formattedValue =
                    Number.isFinite(value)
                        ? value.toFixed(1)
                        : "--";

                details.textContent =
                    `Nodo: ${recommendation.node_id} | ` +
                    `Valor: ${formattedValue}` +
                    (recommendation.variable === "temperature_c"
                        ? " °C"
                        : " %");

                
                    item.appendChild(title);
                    item.appendChild(message);
                    item.appendChild(details);

                    // ==================================
                    // DECISIONES DEL AGRICULTOR
                    // ==================================

                    if (recommendation.decision === "accepted") {

                        const status = document.createElement("p");

                        status.className =
                            "recommendation-decision decision-accepted";

                        status.textContent =
                            "✓ Recomendación aceptada";

                        item.appendChild(status);

                    } else if (recommendation.decision === "rejected") {

                        const status = document.createElement("p");

                        status.className =
                            "recommendation-decision decision-rejected";

                        status.textContent =
                            "Recomendación rechazada";

                        const reason = document.createElement("p");

                        reason.className = "recommendation-reason";

                        reason.textContent =
                            `Motivo: ${recommendation.rejection_reason}`;

                        item.appendChild(status);
                        item.appendChild(reason);

                    } else if (recommendation.id != null) {

                        const actions = document.createElement("div");

                        actions.className = "recommendation-actions";

                        // Botón aceptar.

                        const acceptButton = document.createElement("button");

                        acceptButton.type = "button";

                        acceptButton.className = "recommendation-accept";

                        acceptButton.textContent = "Aceptar";

                        acceptButton.addEventListener("click", () => {

                            showRecommendationDecisionForm(
                                recommendation,
                                "accepted",
                                item,
                                actions
                            );
                        });

                        // Botón rechazar.

                        const rejectButton = document.createElement("button");

                        rejectButton.type = "button";

                        rejectButton.className = "recommendation-reject";

                        rejectButton.textContent = "Rechazar";

                        rejectButton.addEventListener("click", () => {

                            showRecommendationDecisionForm(
                                recommendation,
                                "rejected",
                                item,
                                actions
                            );
                        });

                        actions.appendChild(acceptButton);
                        actions.appendChild(rejectButton);

                        item.appendChild(actions);

                    } else {

                        const status = document.createElement("small");

                        status.textContent =
                            "Esperando registro de la recomendación.";

                        item.appendChild(status);
                    }

                    elements.recommendationText.appendChild(item);

            });

        } else {

            elements.recommendationTitle.textContent =
                "Sin recomendaciones activas";

            const message = document.createElement("p");
            message.textContent =
                "Las últimas mediciones evaluadas " +
                "no activaron ninguna regla agrícola.";

            elements.recommendationText.appendChild(message);
        }

        // ==================================
        // 4. ADVERTENCIAS DE DATOS
        // ==================================

        const warnings = [];

        if (staleCount > 0) {
            warnings.push(
                `${staleCount} nodo(s) con datos desactualizados.`
            );
        }

        if (noDataCount > 0) {
            warnings.push(
                `${noDataCount} nodo(s) sin mediciones.`
            );
        }

        if (invalidCount > 0) {
            warnings.push(
                `${invalidCount} nodo(s) con fecha inválida.`
            );
        }

        if (warnings.length > 0) {

            // Si ningún nodo fue evaluado,
            // no afirmar que todo está normal.
            if (recommendations.length === 0) {
                elements.recommendationTitle.textContent =
                    "Información de sensores pendiente";

                elements.recommendationText.replaceChildren();
            }

            const warning = document.createElement("p");
            warning.className = "recommendation-data-warning";
            warning.textContent = warnings.join(" ");

            elements.recommendationText.appendChild(warning);
        }

    } catch (error) {

        // No modificar la pantalla si ya
        // existe una solicitud más reciente.
        if (!isAuthenticated || requestId !== recommendationsRequestId || nodeId !== elements.nodeSelector.value ) {
            return;
        }

        elements.recommendationTitle.textContent =
            "Recomendaciones no disponibles";

        elements.recommendationText.textContent =
            "No fue posible consultar las recomendaciones. " +
            "Verifica la conexión con el servidor.";
    }
}


/* ========================================
   HISTORIAL DE RECOMENDACIONES
======================================== */

let recommendationHistory = [];
let historyRequestId = 0;


function clearRecommendationHistory() {

    // Invalidar consultas pendientes.

    historyRequestId++;

    // Eliminar datos del usuario anterior.

    recommendationHistory = [];
    // Cerrar el panel desplegable.

    if (elements.historyPanel) {

        elements.historyPanel.open = false;
    }

    if (!elements.historyList) {
        return;
    }

    elements.historyList.replaceChildren();

    elements.historyTotal.textContent = "--";
    elements.historyAccepted.textContent = "--";
    elements.historyRejected.textContent = "--";
    elements.historyPending.textContent = "--";

    elements.historyAcceptanceRate.textContent =
        "Tasa de aceptación: --";

    elements.historyDecisionFilter.value = "all";

    updateHistoryFarmFilter();

    elements.historyMessage.textContent =
        "Cargando historial...";
}

// ========================================
// 1. FORMATEAR FECHAS
// ========================================

function formatHistoryDate(value) {

    if (!value) {
        return "Sin registrar";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Fecha no disponible";
    }

    return date.toLocaleString("es-CO");
}


// ========================================
// 2. CONSULTAR HISTORIAL DESDE FASTAPI
// ========================================

async function loadRecommendationHistory() {

    if (!isAuthenticated || !elements.historyList) {
        return;
    }

    const requestId = ++historyRequestId;

    try {

        const response = await authenticatedFetch(
            "/api/recommendations/history?limit=500",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                "No fue posible consultar el historial."
            );
        }

        const data = await response.json();

        if (!isAuthenticated ||requestId !== historyRequestId) {
            return;
        }

        if (!Array.isArray(data)) {
            throw new Error(
                "Formato de historial incorrecto."
            );
        }

        recommendationHistory = data;

        updateHistoryFarmFilter();
        renderRecommendationHistory();

    } catch (error) {

        if (!isAuthenticated ||requestId !== historyRequestId) {
            return;
        }

        recommendationHistory = [];

        updateHistoryFarmFilter();
        renderRecommendationHistory();

        elements.historyTotal.textContent = "--";
        elements.historyAccepted.textContent = "--";
        elements.historyRejected.textContent = "--";
        elements.historyPending.textContent = "--";

        elements.historyAcceptanceRate.textContent =
            "Tasa de aceptación: --";

        elements.historyMessage.textContent =
            "No fue posible cargar el historial. " +
            "Verifica la conexión y tu sesión.";

    }
}


// ========================================
// 3. CONFIGURAR FILTRO DE FINCAS
// ========================================

function updateHistoryFarmFilter() {

    const previousSelection =
        elements.historyFarmFilter.value;

    const farms = new Map();

    recommendationHistory.forEach((item) => {

        farms.set(
            String(item.farm_id),
            item.farm_name
        );

    });

    elements.historyFarmFilter.replaceChildren();

    const allOption = document.createElement("option");

    allOption.value = "";
    allOption.textContent =
        "Todas las fincas disponibles";

    elements.historyFarmFilter.appendChild(allOption);

    farms.forEach((farmName, farmId) => {

        const option = document.createElement("option");

        option.value = farmId;
        option.textContent = farmName;

        elements.historyFarmFilter.appendChild(option);

    });

    if (farms.has(previousSelection)) {

        elements.historyFarmFilter.value =
            previousSelection;

    } else {

        elements.historyFarmFilter.value = "";
    }

    // Configurar el selector según las fincas disponibles.

    if (farms.size === 0) {

        elements.historyFarmFilter.disabled = true;

        allOption.textContent =
            "Sin fincas con recomendaciones";

    } else if (farms.size === 1) {

        const onlyFarmId = farms.keys().next().value;

        elements.historyFarmFilter.value = onlyFarmId;

        elements.historyFarmFilter.disabled = true;

    } else {

        elements.historyFarmFilter.disabled = false;
    }
}


// ========================================
// 4. ACTUALIZAR ESTADISTICAS
// ========================================

function updateHistoryStatistics(data) {

    const total = data.length;

    const accepted = data.filter(
        item => item.decision === "accepted"
    ).length;

    const rejected = data.filter(
        item => item.decision === "rejected"
    ).length;

    const pending = data.filter(
        item => item.decision == null
    ).length;

    elements.historyTotal.textContent = total;
    elements.historyAccepted.textContent = accepted;
    elements.historyRejected.textContent = rejected;
    elements.historyPending.textContent = pending;

    // Solo considerar recomendaciones
    // sobre las que se tomo una decision.

    const decided = accepted + rejected;

    if (decided === 0) {

        elements.historyAcceptanceRate.textContent =
            "Tasa de aceptación: aún sin decisiones";

    } else {

        const rate = (accepted / decided) * 100;

        elements.historyAcceptanceRate.textContent =
            `Tasa de aceptación: ${rate.toFixed(1)} %`;
    }
}


// ========================================
// 5. CREAR TARJETA DE HISTORIAL
// ========================================


function createHistoryCard(item) {

    const card = document.createElement("article");

    card.className = "history-item";

    // ==================================
    // 1. ENCABEZADO HORIZONTAL
    // ==================================

    const header = document.createElement("div");

    header.className = "history-item-header";

    // Icono según la variable.

    const icon = document.createElement("div");

    icon.className = "history-item-icon";

    if (item.variable === "temperature_c") {

        icon.textContent = "🌡️";

    } else if (item.variable === "soil_moisture_pct") {

        icon.textContent = "🌱";

    } else {

        icon.textContent = "💧";
    }

    // Información principal.

    const content = document.createElement("div");

    content.className = "history-item-content";

    const title = document.createElement("h3");

    title.textContent = item.title;

    const location = document.createElement("p");

    location.className = "history-item-location";

    location.textContent =
        `${item.farm_name} · ${item.node_id}`;

    const date = document.createElement("p");

    date.className = "history-item-date";

    date.textContent =
        formatHistoryDate(item.created_at);

    content.append(title, location, date);

    // Estado de la decisión.

    const badge = document.createElement("span");

    badge.className = "history-badge";

    if (item.decision === "accepted") {

        badge.textContent = "Aceptada";

        badge.classList.add(
            "history-badge-accepted"
        );

    } else if (item.decision === "rejected") {

        badge.textContent = "Rechazada";

        badge.classList.add(
            "history-badge-rejected"
        );

    } else {

        badge.textContent = "Sin decisión";

        badge.classList.add(
            "history-badge-pending"
        );
    }

    header.append(icon, content, badge);

    card.appendChild(header);


    // ==================================
    // 2. MOTIVO DEL RECHAZO
    // ==================================

    if (item.decision === "rejected") {

        const reason = document.createElement("div");

        reason.className = "history-rejection-reason";

        const reasonTitle = document.createElement("strong");

        reasonTitle.textContent = "Motivo: ";

        const reasonText = document.createElement("span");

        reasonText.textContent =
            item.rejection_reason || "Sin información";

        reason.append(reasonTitle, reasonText);

        card.appendChild(reason);
    }


    // ==================================
    // 3. INFORMACIÓN DESPLEGABLE
    // ==================================

    const details = document.createElement("details");

    details.className = "history-expandable";

    const summary = document.createElement("summary");

    summary.textContent = "Ver detalles";

    details.appendChild(summary);

    const detailsContent = document.createElement("div");

    detailsContent.className = "history-details-content";

    // Mensaje original.

    const message = document.createElement("p");

    message.className = "history-item-message";

    message.textContent = item.message;

    detailsContent.appendChild(message);

    // Cuadrícula de información adicional.

    const detailsGrid = document.createElement("div");

    detailsGrid.className = "history-details-grid";

    const unit =
        item.variable === "temperature_c"
            ? "°C"
            : "%";

    // Función auxiliar para crear cada dato.

    function addDetail(label, value) {

        const detail = document.createElement("div");

        detail.className = "history-detail-box";

        const detailLabel = document.createElement("span");

        detailLabel.textContent = label;

        const detailValue = document.createElement("strong");

        detailValue.textContent = value;

        detail.append(detailLabel, detailValue);

        detailsGrid.appendChild(detail);
    }

    addDetail(
        "Valor inicial",
        `${item.value} ${unit}`
    );

    addDetail(
        "Umbral utilizado",
        `${item.threshold} ${unit}`
    );

    addDetail(
        "Estado de la condición",
        item.closed_at ? "Cerrada" : "Abierta"
    );

    addDetail(
        "Última detección",
        formatHistoryDate(item.last_seen_at)
    );

    if (item.closed_at) {

        addDetail(
            "Fecha de cierre",
            formatHistoryDate(item.closed_at)
        );
    }

    if (item.decision != null) {

        addDetail(
            "Usuario responsable",
            item.decided_by_username || "No disponible"
        );

        addDetail(
            "Fecha de decisión",
            formatHistoryDate(item.decided_at)
        );
    }

    detailsContent.appendChild(detailsGrid);

    details.appendChild(detailsContent);

    // Cambiar texto al desplegar la tarjeta.

    details.addEventListener("toggle", () => {

        summary.textContent = details.open
            ? "Ocultar detalles"
            : "Ver detalles";

    });

    card.appendChild(details);

    return card;
}


// ========================================
// 6. FILTRAR Y MOSTRAR HISTORIAL
// ========================================

function renderRecommendationHistory() {

    const selectedFarm =
        elements.historyFarmFilter.value;

    const selectedDecision =
        elements.historyDecisionFilter.value;

    // Filtrar por finca.

    const farmData = recommendationHistory.filter(
        item =>
            selectedFarm === "" ||
            String(item.farm_id) === selectedFarm
    );

    // Estadisticas de la finca seleccionada.

    updateHistoryStatistics(farmData);

    // Filtrar por decision.

    const filteredData = farmData.filter((item) => {

        if (selectedDecision === "all") {
            return true;
        }

        if (selectedDecision === "pending") {
            return item.decision == null;
        }

        return item.decision === selectedDecision;

    });

    elements.historyList.replaceChildren();

    if (filteredData.length === 0) {

        elements.historyMessage.textContent =
            "No hay recomendaciones que coincidan " +
            "con los filtros seleccionados.";

        return;
    }

    elements.historyMessage.textContent =
        `Mostrando ${filteredData.length} ` +
        `de ${farmData.length} recomendaciones cargadas.`;

    filteredData.forEach((item) => {

        const card = createHistoryCard(item);

        elements.historyList.appendChild(card);

    });
}


// ========================================
// 7. INICIALIZAR CONTROLES
// ========================================


/* ========================================
   CONTROL DE PANELES DESPLEGABLES
======================================== */

function initializeCollapsiblePanel(panel,closedText,openedText) {

    if (!panel) return;

    const title = panel.querySelector(".history-panel-title");

    if (!title) return;

    function updateTitle() {title.textContent = panel.open ? openedText : closedText;}

    // Actualizar al abrir o cerrar.

    panel.ontoggle = updateTitle;

    // Establecer el texto inicial.

    updateTitle();

    // Abrir el panel cuando se selecciona
    // desde el menú de navegación.

    window.onhashchange = openPanelFromNavigation;

    openPanelFromNavigation();
}


function openPanelFromNavigation() {

    if (!isAuthenticated) return;

    const sectionId = window.location.hash.slice(1);

    if (!sectionId) return;

    const section = document.getElementById(sectionId);

    if (!section) return;

    // No abrir secciones ocultas para el usuario.

    if (section.closest("[hidden]")) {
        return;
    }

    const panel = section.querySelector(
        ".history-panel"
    );

    if (panel) {

        panel.open = true;
    }
}


function resetAdminPanels() {

    // Cerrar los paneles administrativos.

    if (elements.usersPanel) {
        elements.usersPanel.open = false;
    }

    if (elements.accountPanel) {
        elements.accountPanel.open = false;
    }

    // Limpiar los formularios administrativos.

    const formIds = [
        "create-user-form",
        "edit-user-form",
        "reset-password-form",
        "change-username-form",
        "change-password-form"
    ];

    formIds.forEach(id => {

        const form = document.getElementById(id);

        if (form) {
            form.reset();
        }
    });

    // Ocultar formularios secundarios.

    const containerIds = [
        "create-user-form-container",
        "edit-user-form-container",
        "reset-password-form-container"
    ];

    containerIds.forEach(id => {

        const container = document.getElementById(id);

        if (container) {
            container.hidden = true;
        }
    });

    // Limpiar mensajes administrativos.

    const messageIds = [
        "create-user-message",
        "edit-user-message",
        "reset-password-message",
        "change-username-message",
        "change-password-message",
        "users-message"
    ];

    messageIds.forEach(id => {

        const message = document.getElementById(id);

        if (message) {
            message.textContent = "";
        }
    });

    // Eliminar la lista de usuarios de la sesión anterior.

    const usersTable = document.getElementById(
        "users-table-body"
    );

    if (usersTable) {
        usersTable.replaceChildren();
    }

    // Limpiar el nombre de la cuenta anterior.

    const currentAccount = document.getElementById(
        "account-current-username"
    );

    if (currentAccount) {
        currentAccount.textContent = "";
    }
}


function initializeRecommendationHistory() {

    if (!elements.historyList) {
        return;
    }

    // Filtro de fincas.

    elements.historyFarmFilter.addEventListener(
        "change",
        renderRecommendationHistory
    );

    // Filtro de decisiones.

    elements.historyDecisionFilter.addEventListener(
        "change",
        renderRecommendationHistory
    );

    // Botón actualizar.

    elements.historyRefresh.addEventListener(
        "click",
        loadRecommendationHistory
    );
}


function initializeRecommendationHistory() {

    if (!elements.historyList) {
        return;
    }

    // Filtro de fincas.

    elements.historyFarmFilter.addEventListener(
        "change",
        renderRecommendationHistory
    );

    // Filtro de decisiones.

    elements.historyDecisionFilter.addEventListener(
        "change",
        renderRecommendationHistory
    );

    // Botón de actualización.

    elements.historyRefresh.addEventListener(
        "click",
        loadRecommendationHistory
    );

    // Panel desplegable del historial.

    if (elements.historyPanel) {

        elements.historyPanel.ontoggle = () => {

            const title = elements.historyPanel
                .querySelector(".history-panel-title");

            if (title) {

                title.textContent =
                    elements.historyPanel.open
                        ? "Ocultar historial de recomendaciones"
                        : "Ver historial de recomendaciones";
            }
        };
    }
}



async function refreshDashboard() {

    await checkServerStatus();

    if (!elements.nodeSelector) {
        return;
    }

    const selectedNode = elements.nodeSelector.value;

    // ==================================
    // 1. ACTUALIZAR MEDICIONES
    // ==================================

    if (selectedNode === "") {

        await loadAllNodes();

    } else {

        await loadSelectedNode(selectedNode);
    }

    // Si el usuario cambió la selección
    // mientras se cargaban las mediciones,
    // no consultar la selección anterior.
    if (selectedNode !== elements.nodeSelector.value) {
        return;
    }

    // ==================================
    // 2. ACTUALIZAR RECOMENDACIONES
    // ==================================

    await loadRecommendations(selectedNode);
}


// Inicializamos las funciones del dashboard
// únicamente después de confirmar la autenticación.

async function handleRecommendationNodeChange() {

    activeDecisionForm = null;

    recommendationsRequestId++;

    elements.recommendationText.replaceChildren();

    await refreshDashboard();
}

async function initializeDashboardData() {
    if (!elements.nodeSelector) {
        console.error("No se encontró el selector de nodos.");
        return;
    }

    await loadNodes();

    if (!isAuthenticated) return;

    elements.nodeSelector.removeEventListener(
        "change",
        refreshDashboard
    );

    elements.nodeSelector.removeEventListener(
        "change",
        handleRecommendationNodeChange
    );

    elements.nodeSelector.addEventListener(
        "change",
        handleRecommendationNodeChange
    );

    await refreshDashboard();

    if (!isAuthenticated) return;

    // Inicializar los tres desplegables.
    initializeCollapsiblePanel();

    // Inicializar el historial.
    initializeRecommendationHistory();

    await loadRecommendationHistory();

    if (!isAuthenticated) return;

    // Evitamos crear varios temporizadores.
    if (refreshTimer !== null) {
        clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(refreshDashboard, 15000);
}

// ========================================
// 11. EVENTOS E INICIO DE LA APLICACIÓN
// ========================================

elements.loginForm.addEventListener("submit", login);

elements.logoutButton.addEventListener("click", logout);

// Al abrir la página, primero verificamos la sesión.
// Solo después mostramos y cargamos el dashboard.

checkCurrentSession();

//mostrar usuarios y agregarlos a la tabla en SQLite

/// ========================================
// GESTIÓN DE USUARIOS
// ========================================

async function loadUsers() {
    const usersTableBody = document.getElementById("users-table-body");
    const usersMessage = document.getElementById("users-message");

    try {
        usersMessage.textContent = "Cargando usuarios...";

        const response = await authenticatedFetch("/api/admin/users");

        if (!response.ok) {
            throw new Error("No fue posible cargar los usuarios.");
        }

        const users = await response.json();

        usersTableBody.replaceChildren();

        if (users.length === 0) {
            usersMessage.textContent = "No hay usuarios registrados.";
            return;
        }

        users.forEach(user => {
            const row = document.createElement("tr");

            const username = document.createElement("td");
            username.textContent = user.username;

            const role = document.createElement("td");
            role.textContent =
                user.role === "admin" ? "Administrador" : "Agricultor";

            const farm = document.createElement("td");
            farm.textContent = user.farm_name || "Todas las fincas";

            const status = document.createElement("td");

            const statusBadge = document.createElement("span");

            statusBadge.textContent =
                user.is_active ? "Activo" : "Inactivo";

            statusBadge.className = user.is_active
                ? "user-status active"
                : "user-status inactive";

            status.appendChild(statusBadge);

            const createdAt = document.createElement("td");
            createdAt.textContent = user.created_at
                ? new Date(user.created_at).toLocaleDateString("es-CO")
                : "No disponible";

            const actions = document.createElement("td");
            if (user.role === "farmer") {

                // Botón Editar
                const editButton = document.createElement("button");

                editButton.type = "button";
                editButton.textContent = "Editar";
                editButton.className = "user-edit-button";

                editButton.addEventListener("click", () => {
                    openEditUser(user);
                });

                // Botón Activar / Desactivar
                const statusButton = document.createElement("button");

                statusButton.type = "button";
                statusButton.textContent = user.is_active
                    ? "Desactivar"
                    : "Activar";

                statusButton.className = user.is_active
                    ? "user-deactivate-button"
                    : "user-activate-button";

                statusButton.addEventListener("click", () => {
                    changeUserStatus(user);
                });

                // Botón para restablecer contraseña
                const resetButton = document.createElement("button");

                resetButton.type = "button";
                resetButton.textContent = "Restablecer contraseña";
                resetButton.className = "user-reset-button";

                resetButton.addEventListener("click", () => {
                    openResetPassword(user);
                });

                actions.append(editButton, statusButton, resetButton);

            } else {
                actions.textContent = "—";
            }

            row.append(
                username,
                role,
                farm,
                status,
                createdAt,
                actions
            );

            usersTableBody.appendChild(row);
        });

        usersMessage.textContent =
            `${users.length} usuario(s) registrado(s).`;

    } catch (error) {
        console.error("Error al cargar usuarios:", error);

        usersMessage.textContent =
            "No fue posible cargar la lista de usuarios.";
    }
}

// ========================================
// ABRIR FORMULARIO DE EDICIÓN
// ========================================

function openEditUser(user) {
    const formContainer = document.getElementById(
        "edit-user-form-container"
    );

    const userIdInput = document.getElementById("edit-user-id");
    const usernameInput = document.getElementById("edit-username");
    const farmSelect = document.getElementById("edit-farm");
    const message = document.getElementById("edit-user-message");

    // Cargar los datos actuales del agricultor
    userIdInput.value = user.id;
    usernameInput.value = user.username;
    farmSelect.value = String(user.farm_id);

    // Limpiar mensajes anteriores
    message.textContent = "";

    // Mostrar formulario
    formContainer.hidden = false;

    // Llevar la vista hasta el formulario
    formContainer.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

// ========================================
// CANCELAR EDICIÓN
// ========================================

function cancelEditUser() {
    const formContainer = document.getElementById(
        "edit-user-form-container"
    );

    const form = document.getElementById("edit-user-form");

    form.reset();

    formContainer.hidden = true;
}

// ========================================
// GUARDAR CAMBIOS DEL USUARIO
// ========================================

async function saveEditedUser(event) {
    event.preventDefault();

    const userId = document.getElementById("edit-user-id").value;
    const username = document.getElementById("edit-username").value.trim();
    const farmId = Number(document.getElementById("edit-farm").value);

    const message = document.getElementById("edit-user-message");
    const saveButton = document.querySelector(
        "#edit-user-form button[type='submit']"
    );

    if (username.length < 3 || !farmId) {
        message.textContent = "Completa correctamente todos los campos.";
        return;
    }

    try {
        saveButton.disabled = true;
        message.textContent = "Guardando cambios...";

        const response = await authenticatedFetch(
            `/api/admin/users/${userId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    farm_id: farmId
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "No fue posible actualizar el usuario."
            );
        }

        message.textContent = "¡Usuario actualizado correctamente!";

        // Actualizar la tabla con los nuevos datos
        await loadUsers();

        // Ocultar formulario
        document.getElementById(
            "edit-user-form-container"
        ).hidden = true;

    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        message.textContent = error.message;

    } finally {
        saveButton.disabled = false;
    }
}

// ========================================
// EVENTOS DE EDICIÓN DE USUARIOS
// ========================================

document.getElementById("edit-user-form").addEventListener(
    "submit",
    saveEditedUser
);

document.getElementById("cancel-edit-user").addEventListener(
    "click",
    cancelEditUser
);

// ========================================
// ACTIVAR / DESACTIVAR USUARIOS
// ========================================

async function changeUserStatus(user) {

    const action = user.is_active
        ? "desactivar"
        : "activar";

    const confirmed = window.confirm(
        `¿Estás segura de que deseas ${action} la cuenta de ${user.username}?`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await authenticatedFetch(
            `/api/admin/users/${user.id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    is_active: !user.is_active
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "No fue posible cambiar el estado."
            );
        }

        await loadUsers();

    } catch (error) {

        console.error("Error al cambiar estado:", error);

        alert(error.message);
    }
}

// ========================================
// CREAR NUEVOS AGRICULTORES
// ========================================

const createUserContainer = document.getElementById(
    "create-user-form-container"
);

const createUserForm = document.getElementById("create-user-form");

const createUserMessage = document.getElementById("create-user-message");


// Abrir formulario
document.getElementById("create-user-button").addEventListener("click", () => {

    // Ocultar los otros formularios
    document.getElementById("edit-user-form-container").hidden = true;
    document.getElementById("reset-password-form-container").hidden = true;

    createUserForm.reset();
    createUserMessage.textContent = "";

    createUserContainer.hidden = false;

    createUserContainer.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
});


// Cancelar creación
document.getElementById("cancel-create-user").addEventListener("click", () => {

    createUserForm.reset();
    createUserContainer.hidden = true;
});


// Enviar formulario
createUserForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const username = document.getElementById("new-username").value.trim();

    const password = document.getElementById("new-password").value;

    const farmId = Number(document.getElementById("new-farm").value);

    const submitButton = createUserForm.querySelector(
        "button[type='submit']"
    );

    if (username.length < 3 || !farmId || !password.trim()) {
        createUserMessage.textContent =
            "Completa correctamente todos los campos.";
        return;
    }

    if (password.length < 6 || password.length > 128) {
        createUserMessage.textContent =
            "La contraseña debe tener entre 6 y 128 caracteres.";
        return;
    }

    try {

        submitButton.disabled = true;
        createUserMessage.textContent = "Creando agricultor...";

        const response = await authenticatedFetch(
            "/api/admin/users",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    farm_id: farmId
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail || "No fue posible crear el agricultor."
            );
        }

        createUserMessage.textContent =
            "¡Agricultor creado correctamente!";

        createUserForm.reset();

        await loadUsers();

    } catch (error) {

        console.error("Error al crear agricultor:", error);

        createUserMessage.textContent = error.message;

    } finally {

        submitButton.disabled = false;
    }
});


// ========================================
// RESTABLECER CONTRASEÑAS
// ========================================

const resetPasswordContainer = document.getElementById(
    "reset-password-form-container"
);

const resetPasswordForm = document.getElementById(
    "reset-password-form"
);

const resetPasswordMessage = document.getElementById(
    "reset-password-message"
);


// Abrir formulario
function openResetPassword(user) {

    // Ocultar otros formularios
    document.getElementById("edit-user-form-container").hidden = true;
    createUserContainer.hidden = true;

    resetPasswordForm.reset();
    resetPasswordMessage.textContent = "";

    document.getElementById("reset-password-user-id").value = user.id;

    document.getElementById("reset-password-username").textContent =
        `Nueva contraseña para: ${user.username}`;

    resetPasswordContainer.hidden = false;

    resetPasswordContainer.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}


// Cancelar restablecimiento
document.getElementById("cancel-reset-password").addEventListener(
    "click",
    () => {

        resetPasswordForm.reset();
        resetPasswordContainer.hidden = true;
    }
);


// Guardar nueva contraseña
resetPasswordForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const userId = document.getElementById(
        "reset-password-user-id"
    ).value;

    const password = document.getElementById(
        "reset-new-password"
    ).value;

    const submitButton = resetPasswordForm.querySelector(
        "button[type='submit']"
    );

    if (!password.trim()) {
        resetPasswordMessage.textContent =
            "La contraseña no puede estar vacía.";
        return;
    }

    if (password.length < 6 || password.length > 128) {
        resetPasswordMessage.textContent =
            "La contraseña debe tener entre 6 y 128 caracteres.";
        return;
    }

    const confirmed = window.confirm(
        "¿Estás segura de que deseas restablecer la contraseña? " +
        "El agricultor deberá iniciar sesión nuevamente."
    );

    if (!confirmed) {
        return;
    }

    try {

        submitButton.disabled = true;

        resetPasswordMessage.textContent =
            "Actualizando contraseña...";

        const response = await authenticatedFetch(
            `/api/admin/users/${userId}/password`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password: password
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.detail ||
                "No fue posible restablecer la contraseña."
            );
        }

        resetPasswordMessage.textContent =
            "¡Contraseña restablecida correctamente!";

        resetPasswordForm.reset();

    } catch (error) {

        console.error("Error al restablecer contraseña:", error);

        resetPasswordMessage.textContent = error.message;

    } finally {

        submitButton.disabled = false;
    }
});

// ========================================
// MI CUENTA - ADMINISTRADOR
// ========================================

// ========================================
// CAMBIAR NOMBRE DE USUARIO
// ========================================

const changeUsernameForm = document.getElementById(
    "change-username-form"
);

const changeUsernameMessage = document.getElementById(
    "change-username-message"
);


// Al abrir el formulario, mostramos el usuario actual.
function loadAccountInformation(username) {

    document.getElementById(
        "account-current-username"
    ).textContent = username;

    document.getElementById(
        "account-new-username"
    ).value = username;
}


// Enviar solicitud para cambiar el usuario.
changeUsernameForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const username = document.getElementById(
        "account-new-username"
    ).value.trim();

    const submitButton = changeUsernameForm.querySelector(
        "button[type='submit']"
    );

    if (username.length < 3 || username.length > 50) {

        changeUsernameMessage.textContent =
            "El nombre de usuario debe tener entre 3 y 50 caracteres.";

        return;
    }

    try {

        submitButton.disabled = true;

        changeUsernameMessage.textContent =
            "Actualizando nombre de usuario...";

        const response = await authenticatedFetch(
            "/api/auth/me/username",
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: username
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.detail ||
                "No fue posible cambiar el nombre de usuario."
            );
        }

        // Actualizamos el nombre en toda la interfaz.
        const updatedUsername = result.user.username;

        elements.currentUsername.textContent = updatedUsername;

        elements.welcomeMessage.textContent =
            `¡Hola, ${updatedUsername}!`;

        document.getElementById(
            "account-current-username"
        ).textContent = updatedUsername;

        document.getElementById(
            "account-new-username"
        ).value = updatedUsername;

        changeUsernameMessage.textContent =
            "¡Nombre de usuario actualizado correctamente!";

    } catch (error) {

        console.error("Error al cambiar el usuario:", error);

        changeUsernameMessage.textContent = error.message;

    } finally {

        submitButton.disabled = false;
    }
});


// ========================================
// CAMBIAR CONTRASEÑA
// ========================================

const changePasswordForm = document.getElementById(
    "change-password-form"
);

const changePasswordMessage = document.getElementById(
    "change-password-message"
);


changePasswordForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const currentPassword = document.getElementById(
        "account-current-password"
    ).value;

    const newPassword = document.getElementById(
        "account-new-password"
    ).value;

    const confirmPassword = document.getElementById(
        "account-confirm-password"
    ).value;

    const submitButton = changePasswordForm.querySelector(
        "button[type='submit']"
    );


    // Validaciones antes de enviar los datos.

    if (!currentPassword.trim()) {

        changePasswordMessage.textContent =
            "Debes ingresar tu contraseña actual.";

        return;
    }

    if (newPassword.length < 6 || newPassword.length > 128) {

        changePasswordMessage.textContent =
            "La nueva contraseña debe tener entre 6 y 128 caracteres.";

        return;
    }

    if (!newPassword.trim()) {

        changePasswordMessage.textContent =
            "La nueva contraseña no puede estar vacía.";

        return;
    }

    if (newPassword !== confirmPassword) {

        changePasswordMessage.textContent =
            "Las nuevas contraseñas no coinciden.";

        return;
    }

    if (currentPassword === newPassword) {

        changePasswordMessage.textContent =
            "La nueva contraseña debe ser diferente a la actual.";

        return;
    }


    try {

        submitButton.disabled = true;

        changePasswordMessage.textContent =
            "Actualizando contraseña...";

        const response = await authenticatedFetch(
            "/api/auth/me/password",
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.detail ||
                "No fue posible cambiar la contraseña."
            );
        }

        // Limpiamos los campos por seguridad.
        changePasswordForm.reset();

        // El servidor ya invalidó las sesiones anteriores
        // y eliminó la cookie de autenticación.
        // Por eso regresamos al inicio de sesión.

        showLogin(
            "¡Contraseña actualizada correctamente! " +
            "Inicia sesión con tu nueva contraseña."
        );

    } catch (error) {

        console.error("Error al cambiar la contraseña:", error);

        changePasswordMessage.textContent = error.message;

    } finally {

        submitButton.disabled = false;
    }
});