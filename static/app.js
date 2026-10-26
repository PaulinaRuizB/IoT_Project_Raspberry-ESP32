
/*
 * Mi Cultivo - Frontend
 * Consulta los datos del IoT Server y actualiza el dashboard.
 */

const elements = {
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

function showNoMeasurement() {
    elements.soilMoisture.textContent = "--";
    elements.temperature.textContent = "--";
    elements.humidity.textContent = "--";
    elements.nodeId.textContent = "--";

    elements.soilUpdated.textContent = "Esperando primera medición";

    elements.recommendationTitle.textContent = "Aún no hay mediciones";
    elements.recommendationText.textContent =
        "Cuando este nodo envíe sus datos, podremos mostrar " +
        "información y recomendaciones para tu cultivo.";
}

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

async function loadNodes() {
    try {
        const response = await fetch("/api/nodes");

        if (!response.ok) {
            throw new Error("No se pudieron consultar los nodos.");
        }

        const nodes = await response.json();
        const previousSelection = elements.nodeSelector.value;

        // Conservamos la opción general.
        elements.nodeSelector.replaceChildren();

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "Todos los nodos";
        elements.nodeSelector.appendChild(allOption);

        // Añadimos los nodos que existen en la base de datos.
        nodes.forEach((nodeId) => {
            const option = document.createElement("option");
            option.value = nodeId;
            option.textContent = nodeId;
            elements.nodeSelector.appendChild(option);
        });

        // Conservamos la selección si el nodo sigue existiendo.
        const selectionStillExists = Array.from(
            elements.nodeSelector.options
        ).some((option) => option.value === previousSelection);

        elements.nodeSelector.value = selectionStillExists
            ? previousSelection
            : "";

    } catch (error) {
        elements.systemMessage.textContent =
            "No fue posible cargar la lista de nodos.";
    }
}

function showMeasurement(data) {
    elements.soilMoisture.textContent =
        `${data.soil_moisture_pct}%`;

    elements.temperature.textContent =
        `${data.temperature_c} °C`;

    elements.humidity.textContent =
        `${data.humidity_pct}%`;

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

async function getLatestMeasurement(nodeId) {
    let url = "/api/measurements/latest";

    if (nodeId) {
        url += `?node_id=${encodeURIComponent(nodeId)}`;
    }

    const response = await fetch(url);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error("No se pudo consultar la medición.");
    }

    return response.json();
}

async function loadSelectedNode(nodeId) {
    elements.metricsGrid.hidden = false;
    elements.allNodesContainer.hidden = true;

    try {
        const measurement = await getLatestMeasurement(nodeId);

        if (!measurement) {
            showNoMeasurement();
            return;
        }

        showMeasurement(measurement);

    } catch (error) {
        elements.soilUpdated.textContent =
            "No fue posible cargar la medición.";

        elements.recommendationTitle.textContent =
            "Datos temporalmente no disponibles";

        elements.recommendationText.textContent =
            "Comprueba la conexión con el servidor e inténtalo de nuevo.";
    }
}

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
    soilValue.textContent = `${measurement.soil_moisture_pct}%`;
    soil.appendChild(soilValue);
    card.appendChild(soil);

    const temperature = document.createElement("p");
    temperature.textContent = "Temperatura: ";

    const temperatureValue = document.createElement("strong");
    temperatureValue.textContent = `${measurement.temperature_c} °C`;
    temperature.appendChild(temperatureValue);
    card.appendChild(temperature);

    const humidity = document.createElement("p");
    humidity.textContent = "Humedad ambiental: ";

    const humidityValue = document.createElement("strong");
    humidityValue.textContent = `${measurement.humidity_pct}%`;
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

async function loadAllNodes() {
    elements.metricsGrid.hidden = true;
    elements.allNodesContainer.hidden = false;
    elements.allNodesContainer.replaceChildren();

    try {
        const response = await fetch("/api/nodes");

        if (!response.ok) {
            throw new Error("No se pudieron consultar los nodos.");
        }

        const nodes = await response.json();

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
        const message = document.createElement("p");
        message.textContent =
            "No fue posible cargar los datos de los nodos.";
        elements.allNodesContainer.appendChild(message);
    }
}

async function refreshDashboard() {
    await checkServerStatus();

    if (!elements.nodeSelector) {
        return;
    }

    const selectedNode = elements.nodeSelector.value;

    if (selectedNode === "") {
        await loadAllNodes();
    } else {
        await loadSelectedNode(selectedNode);
    }
}

// Cargamos la lista de nodos y después sus mediciones.
async function initializeDashboard() {
    if (!elements.nodeSelector) {
        elements.systemMessage.textContent =
            "No se encontró el selector de nodos en la página.";
        return;
    }

    await loadNodes();

    elements.nodeSelector.addEventListener("change", refreshDashboard);

    await refreshDashboard();
}

initializeDashboard();

// Actualizamos los datos cada 15 segundos.
setInterval(refreshDashboard, 15000);