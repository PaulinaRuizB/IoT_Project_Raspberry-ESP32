
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
    recommendationText: document.getElementById("recommendation-text")
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

    if (elements.welcomeMessage) {
        elements.welcomeMessage.textContent =
            `¡Hola, ${user.username}!`;
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
        allOption.textContent = "Todos los nodos";
        elements.nodeSelector.appendChild(allOption);

        nodes.forEach((nodeId) => {
            const option = document.createElement("option");
            option.value = nodeId;
            option.textContent = nodeId;
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

    elements.nodeId.textContent = data.node_id;

    const measurementDate = new Date(data.timestamp);

    elements.soilUpdated.textContent =
        `Registrada: ${measurementDate.toLocaleString("es-CO")}`;

    elements.recommendationTitle.textContent =
        "Última medición recibida";

    elements.recommendationText.textContent =
        "Los datos de este nodo se han cargado correctamente. " +
        "Las recomendaciones de riego se implementarán más adelante " +
        "con reglas apropiadas para cada cultivo.";
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

function createNodeCard(nodeId, measurement) {
    const card = document.createElement("article");
    card.className = "node-summary-card";

    const title = document.createElement("h3");
    title.textContent = nodeId;
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

        elements.recommendationTitle.textContent =
            "Resumen de los nodos";

        elements.recommendationText.textContent =
            "Aquí puedes comparar las últimas mediciones registradas " +
            "por cada nodo del cultivo.";

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

async function refreshDashboard() {
    if (!isAuthenticated) return;

    await checkServerStatus();

    if (!isAuthenticated) return;

    const selectedNode = elements.nodeSelector.value;

    if (selectedNode === "") {
        await loadAllNodes();
    } else {
        await loadSelectedNode(selectedNode);
    }
}

// Inicializamos las funciones del dashboard
// únicamente después de confirmar la autenticación.

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

    elements.nodeSelector.addEventListener(
        "change",
        refreshDashboard
    );

    await refreshDashboard();

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
