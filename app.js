import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// CONFIGURAZIONE API TRIPO
// Sostituisci con la tua Bearer Token reale
// ==========================================
const API_KEY = 'INSERISCI_LA_TUA_API_KEY_QUI';
const API_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

// Elementi DOM
const imageInput = document.getElementById('imageInput');
const generateBtn = document.getElementById('generateBtn');
const statusDiv = document.getElementById('status');
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBar = document.getElementById('progress-bar');
const canvasContainer = document.getElementById('canvas-container');

// Variabili globali Three.js
let scene, camera, renderer, controls, currentModel;

// ==========================================
// SETUP DELLA SCENA 3D (Three.js)
// ==========================================
function init3DScene() {
    // 1. Scena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 3);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasContainer.appendChild(renderer.domElement);

    // 4. Controlli (Orbita)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // 5. Illuminazione
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 1);
    backLight.position.set(-5, 5, -7);
    scene.add(backLight);

    // Gestione ridimensionamento finestra
    window.addEventListener('resize', onWindowResize);

    // Avvio loop di animazione
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ==========================================
// CARICAMENTO E RENDERING DEL MODELLO
// ==========================================
function loadGLTFModel(url) {
    statusDiv.textContent = "Scaricamento e rendering del modello in corso...";
    
    // Rimuovi il modello precedente se esiste
    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
    }

    const loader = new GLTFLoader();
    loader.load(
        url,
        (gltf) => {
            currentModel = gltf.scene;
            
            // Centra e scala il modello automaticamente
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2.0 / maxDim;
            
            currentModel.position.sub(center);
            currentModel.scale.setScalar(scale);

            // Crea un gruppo per contenere il modello centrato
            const group = new THREE.Group();
            group.add(currentModel);
            scene.add(group);
            
            statusDiv.textContent = "Mesh 3D caricata con successo!";
        },
        (xhr) => {
            const percent = (xhr.loaded / xhr.total) * 100;
            progressBar.style.width = `${percent}%`;
        },
        (error) => {
            console.error(error);
            statusDiv.textContent = "Errore durante il caricamento del modello nel viewer.";
        }
    );
}

// ==========================================
// LOGICA DI INFERENZA API (Metodo Completo)
// ==========================================

// 1. Funzione per caricare l'immagine sui server Tripo
async function uploadImage(file) {
    statusDiv.textContent = "Caricamento immagine in corso...";
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`
        },
        body: formData
    });

    if (!response.ok) throw new Error("Caricamento immagine fallito");
    const data = await response.json();
    return data.data.image_token; // Restituisce il token dell'immagine
}

// 2. Funzione per creare il task di inferenza image-to-3d
async function createInferenceTask(imageToken) {
    statusDiv.textContent = "Inizializzazione inferenza 3D...";
    const response = await fetch(`${API_BASE_URL}/task`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            type: "image_to_model",
            file: {
                type: "png",
                file_token: imageToken
            }
        })
    });

    if (!response.ok) throw new Error("Creazione task fallita");
    const data = await response.json();
    return data.data.task_id; // Restituisce l'ID del task
}

// 3. Funzione per effettuare il polling del task finché non è completato
async function pollTaskStatus(taskId) {
    statusDiv.textContent = "Generazione mesh in corso (potrebbe richiedere alcuni minuti)...";
    progressBarContainer.style.display = 'block';
    
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/task/${taskId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`
                    }
                });
                
                const data = await response.json();
                const status = data.data.status;
                const progress = data.data.progress || 0;
                
                progressBar.style.width = `${progress}%`;
                statusDiv.textContent = `Generazione in corso: ${progress}%`;

                if (status === 'success') {
                    clearInterval(interval);
                    progressBarContainer.style.display = 'none';
                    resolve(data.data.result.model.url); // URL del file .glb generato
                } else if (status === 'failed' || status === 'cancelled') {
                    clearInterval(interval);
                    reject(new Error(`Il task ha restituito uno stato di errore: ${status}`));
                }
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, 3000); // Polling ogni 3 secondi
    });
}

// Handler Principale
generateBtn.addEventListener('click', async () => {
    const file = imageInput.files[0];
    if (!file) {
        alert("Per favore, seleziona un'immagine prima di generare.");
        return;
    }

    generateBtn.disabled = true;
    progressBar.style.width = '0%';
    
    try {
        // Pipeline completa
        const imageToken = await uploadImage(file);
        const taskId = await createInferenceTask(imageToken);
        const modelUrl = await pollTaskStatus(taskId);
        
        // Esegui il render del risultato
        loadGLTFModel(modelUrl);
        
    } catch (error) {
        console.error(error);
        statusDiv.textContent = `Errore: ${error.message}`;
        progressBarContainer.style.display = 'none';
    } finally {
        generateBtn.disabled = false;
    }
});

// Inizializza l'ambiente al caricamento
init3DScene();
