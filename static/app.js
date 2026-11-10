
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