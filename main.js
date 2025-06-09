// main.js
import * as THREE from './libs/three.module.js';

// --- 顶层变量声明 ---
let scene, camera, renderer, figureGroup, ground;
let ambientLight, directionalLight;
let capturer = null;
let isRecording = false;
let currentFrame = 0;
let totalAnimFrames = 300;
let targetFPS = 30;

// 人形基础尺寸
const baseFigureBodyHeight = 0.7;
const baseFigureHeadRadius = 0.25;

// 全局相机状态变量
let actualCamDistance, actualCamElevationRad, actualCamAzimuthRad;
let actualPanX, actualPanY, actualFov;
let actualCamRollRad; // --- 新增: 镜头旋转角度状态 ---

// 动作段数组
let cameraActionSegments = [];

// --- 预览功能相关变量 ---
let isPreviewing = false;
let previewAnimationRequest;

// --- HTML 元素引用变量 ---
let canvasEl, numFramesInput, figureScaleInput, lookAtHeightOffsetInput,
    initialDistanceInput, initialElevationDegInput, initialAzimuthDegInput,
    fovInput, outputFormatInput, videoWidthInput, videoHeightInput,
    fpsInput, startButton, statusDiv, progressBar;

// 动态UI、预览控件和拖动手柄的引用
let numActionSlotsInput, updateSlotsButton, actionSegmentsContainer,
    previewPlayPauseButton, previewStopButton, previewScrubber, previewFrameCounter,
    dragHandle;


// --- 工具函数 ---
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

const EasingFunctions = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
};

// --- 核心功能函数 ---

function createFigure(scale) {
    if (figureGroup && figureGroup.parent) {
        scene.remove(figureGroup);
        figureGroup.traverse(child => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
    }
    figureGroup = new THREE.Group();
    const headRadius = baseFigureHeadRadius * scale;
    const bodyWidth = 0.5 * scale;
    const bodyHeight = baseFigureBodyHeight * scale;
    const bodyDepth = 0.25 * scale;
    const limbLength = 0.6 * scale;
    const limbRadius = 0.08 * scale;
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.6, metalness: 0.1 });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.7, metalness: 0.1 });
    const limbMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.1 });
    const headGeometry = new THREE.SphereGeometry(headRadius, 32, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = (bodyHeight / 2) + headRadius;
    head.castShadow = true;
    figureGroup.add(head);
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    figureGroup.add(body);
    const limbPositions = [
        { x: -bodyWidth / 2 - limbRadius, y: bodyHeight / 2 - limbLength * 0.3, z: 0, isArm: true },
        { x: bodyWidth / 2 + limbRadius, y: bodyHeight / 2 - limbLength * 0.3, z: 0, isArm: true },
        { x: -bodyWidth / 4, y: -bodyHeight / 2, z: 0, isArm: false },
        { x: bodyWidth / 4, y: -bodyHeight / 2, z: 0, isArm: false }
    ];
    limbPositions.forEach(posData => {
        const limbGeometry = new THREE.CylinderGeometry(limbRadius, limbRadius, limbLength, 16);
        const limb = new THREE.Mesh(limbGeometry, limbMaterial);
        limb.position.set(posData.x, posData.y - (posData.isArm ? 0 : limbLength / 2), posData.z);
        if (posData.isArm) {
            limb.position.y = posData.y - limbLength / 2;
        }
        limb.castShadow = true;
        figureGroup.add(limb);
    });
    const minY = -bodyHeight / 2 - limbLength / 2;
    figureGroup.position.y = -minY + 0.01;
    scene.add(figureGroup);
    return figureGroup;
}


function createActionSegmentHTML(count) {
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>启用</th>
                    <th>类型</th>
                    <th>起始帧</th>
                    <th>结束帧</th>
                    <th>起始值</th>
                    <th>结束值</th>
                    <th>缓动</th>
                </tr>
            </thead>
            <tbody>
    `;

    const easingOptions = Object.keys(EasingFunctions).map(name => `<option value="${name}">${name.charAt(0).toUpperCase() + name.slice(1)}</option>`).join('');
    
    // --- 修改: 增加“镜头旋转”选项 ---
    const typeOptions = `
        <option value="none">无</option>
        <option value="distance">距离</option>
        <option value="elevation">海拔角</option>
        <option value="azimuth">方位角</option>
        <option value="panX">Pan X</option>
        <option value="panY">Pan Y</option>
        <option value="fov">FOV</option>
        <option value="roll">镜头旋转</option>
    `;

    for (let i = 0; i < count; i++) {
        tableHTML += `
            <tr>
                <td>${i + 1}</td>
                <td><input type="checkbox" id="action_${i}_enabled"></td>
                <td><select id="action_${i}_type">${typeOptions}</select></td>
                <td><input type="number" id="action_${i}_startFrame" value="0" min="0"></td>
                <td><input type="number" id="action_${i}_endFrame" value="0" min="0"></td>
                <td><input type="number" id="action_${i}_startValue" value="0" step="any"></td>
                <td><input type="number" id="action_${i}_endValue" value="0" step="any"></td>
                <td><select id="action_${i}_easing">${easingOptions}</select></td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table>`;
    return tableHTML;
}

function parseActionSegmentsFromHTML() {
    const segments = [];
    const numActionSlots = parseInt(numActionSlotsInput.value);

    for (let i = 0; i < numActionSlots; i++) {
        const enabledCheckbox = document.getElementById(`action_${i}_enabled`);
        if (enabledCheckbox && enabledCheckbox.checked) {
            const type = document.getElementById(`action_${i}_type`).value;
            if (type === "none") continue;

            const startFrame = parseInt(document.getElementById(`action_${i}_startFrame`).value);
            const endFrame = parseInt(document.getElementById(`action_${i}_endFrame`).value);
            const startValue = parseFloat(document.getElementById(`action_${i}_startValue`).value);
            const endValue = parseFloat(document.getElementById(`action_${i}_endValue`).value);
            const easing = document.getElementById(`action_${i}_easing`).value;

            if (isNaN(startFrame) || isNaN(endFrame) || isNaN(startValue) || isNaN(endValue)) {
                console.warn(`动作段 ${i + 1} 的数值无效，已跳过。`);
                continue;
            }
            if (startFrame > endFrame) {
                 console.warn(`动作段 ${i + 1} 的起始帧 (${startFrame}) 大于结束帧 (${endFrame})，已跳过。`);
                 continue;
            }

            const segment = {
                type: type,
                startFrame: startFrame,
                endFrame: endFrame,
                easing: easing
            };
            
            // --- 修改: 将roll也视为角度值处理 ---
            if (type === 'elevation' || type === 'azimuth' || type === 'roll') {
                segment.startValueDeg = startValue;
                segment.endValueDeg = endValue;
            } else {
                segment.startValue = startValue;
                segment.endValue = endValue;
            }
            segments.push(segment);
        }
    }
    return segments;
}

function initThreeJS(forRecording = false) {
    const width = parseInt(videoWidthInput.value);
    const height = parseInt(videoHeightInput.value);

    if (!renderer || renderer.domElement.width !== width || renderer.domElement.height !== height) {
        if (renderer) renderer.dispose();
        renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio > 1 && !forRecording ? 2 : 1);
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xcccccc);

    if (scene) {
        while(scene.children.length > 0){
            const object = scene.children[0];
            if(object.isMesh || object.isLight || object.isGroup || object.isLineSegments) {
                if(object.geometry) object.geometry.dispose();
                if(object.material){
                    if(Array.isArray(object.material)){
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
                if (object.texture) object.texture.dispose();
            }
            scene.remove(object);
        }
        if (scene.background && scene.background.dispose) {
            scene.background.dispose();
        }
    }
    scene = new THREE.Scene();

    let initialFovFromInput = parseFloat(fovInput.value);
    const aspect = width / height;
    if (!camera || camera.aspect !== aspect) {
        camera = new THREE.PerspectiveCamera(initialFovFromInput, aspect, 0.1, 3000);
    } else {
        camera.fov = initialFovFromInput;
        camera.aspect = aspect;
        camera.far = 3000;
        camera.updateProjectionMatrix();
    }
    ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(25, 40, 30);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(2048, 2048);
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 150;
    directionalLight.shadow.camera.left = -50; directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50; directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.bias = -0.0005;
    scene.add(directionalLight);
    const scale = parseFloat(figureScaleInput.value);
    figureGroup = createFigure(scale);
    const groundSize = 100;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95, metalness: 0.0 });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const gridH = new THREE.GridHelper(groundSize, groundSize / 2, 0x000000, 0x404040);
    gridH.position.y = 0.01;
    gridH.name = "gridHelper";
    scene.add(gridH);
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTextureLoader.setPath('textures/skybox/');
    const skyboxCubeTexture = cubeTextureLoader.load([
        'px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'
    ], function(texture) {
        scene.background = texture;
        if (!isRecording && !isPreviewing) renderSingleFrame();
    }, undefined, function(error) {
        console.error("Skybox loading error:", error);
        scene.background = new THREE.Color(0x607d8b);
        if (!isRecording && !isPreviewing) renderSingleFrame();
    });
    const distMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.9, metalness: 0.1 });
    const numDistObjs = 30;
    for (let i = 0; i < numDistObjs; i++) {
        const s = Math.random() * 6 + 4;
        const angle = Math.random() * Math.PI * 2;
        const distance = groundSize / 2 * (0.8 + Math.random() * 0.4);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const y = s / 2 + (Math.random() * 2);
        let o;
        const typeRand = Math.random();
        if (typeRand > 0.7) o = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.5 + Math.random()), s), distMat.clone());
        else if (typeRand > 0.4) o = new THREE.Mesh(new THREE.SphereGeometry(s / 2 * (0.8 + Math.random()*0.4), 12, 6), distMat.clone());
        else o = new THREE.Mesh(new THREE.CylinderGeometry(s / 3, s / 2, s, 12), distMat.clone());
        o.position.set(x, y, z);
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.isDistantObject = true;
        scene.add(o);
    }

    if (forRecording || (!forRecording && !isPreviewing)) {
         resetCameraToInitialState();
    }

    updateAndRenderFrame(currentFrame);
}

// --- 修改: 重置相机状态时，也重置旋转角度 ---
function resetCameraToInitialState() {
    actualCamDistance = parseFloat(initialDistanceInput.value);
    actualCamElevationRad = parseFloat(initialElevationDegInput.value) * (Math.PI / 180);
    actualCamAzimuthRad = parseFloat(initialAzimuthDegInput.value) * (Math.PI / 180);
    actualPanX = 0;
    actualPanY = 0;
    actualFov = parseFloat(fovInput.value);
    actualCamRollRad = 0; // 新增
}

// --- 修改: 更新渲染帧的函数，加入镜头旋转逻辑 ---
function updateAndRenderFrame(frame) {
    if (!figureGroup || !scene) {
        return;
    }

    resetCameraToInitialState();
    
    for (let f = 0; f <= frame; f++) {
        let frameTargetDistance = actualCamDistance;
        let frameTargetElevationRad = actualCamElevationRad;
        let frameTargetAzimuthRad = actualCamAzimuthRad;
        let frameTargetPanX = actualPanX;
        let frameTargetPanY = actualPanY;
        let frameTargetFov = actualFov;
        let frameTargetRollRad = actualCamRollRad; // 新增

        cameraActionSegments.forEach(seg => {
            if (f >= seg.startFrame && f <= seg.endFrame) {
                const duration = seg.endFrame - seg.startFrame;
                const progress = (duration === 0) ? 1 : (f - seg.startFrame) / duration;
                const easingFunction = EasingFunctions[seg.easing] || EasingFunctions.linear;
                const easedProgress = easingFunction(progress);
                let segStartRad, segEndRad;
                switch (seg.type) {
                    case 'distance': frameTargetDistance = lerp(seg.startValue, seg.endValue, easedProgress); break;
                    case 'elevation':
                        segStartRad = seg.startValueDeg * (Math.PI / 180);
                        segEndRad = seg.endValueDeg * (Math.PI / 180);
                        frameTargetElevationRad = lerp(segStartRad, segEndRad, easedProgress);
                        break;
                    case 'azimuth':
                        segStartRad = seg.startValueDeg * (Math.PI / 180);
                        segEndRad = seg.endValueDeg * (Math.PI / 180);
                        frameTargetAzimuthRad = lerp(segStartRad, segEndRad, easedProgress);
                        break;
                    case 'panX': frameTargetPanX = lerp(seg.startValue, seg.endValue, easedProgress); break;
                    case 'panY': frameTargetPanY = lerp(seg.startValue, seg.endValue, easedProgress); break;
                    case 'fov': frameTargetFov = lerp(seg.startValue, seg.endValue, easedProgress); break;
                    case 'roll': // 新增
                        segStartRad = seg.startValueDeg * (Math.PI / 180);
                        segEndRad = seg.endValueDeg * (Math.PI / 180);
                        frameTargetRollRad = lerp(segStartRad, segEndRad, easedProgress);
                        break;
                }
            }
        });
        
        actualCamDistance = frameTargetDistance;
        actualCamElevationRad = frameTargetElevationRad;
        actualCamAzimuthRad = frameTargetAzimuthRad;
        actualPanX = frameTargetPanX;
        actualPanY = frameTargetPanY;
        actualFov = frameTargetFov;
        actualCamRollRad = frameTargetRollRad; // 新增
    }

    const objectScale = parseFloat(figureScaleInput.value);
    const userVerticalOffset = parseFloat(lookAtHeightOffsetInput.value);
    const figureBaseLookAtY = figureGroup.position.y;
    const targetFigureCenterY = figureBaseLookAtY + (baseFigureBodyHeight * objectScale / 2) + (userVerticalOffset * objectScale);

    actualCamElevationRad = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, actualCamElevationRad));
    actualCamDistance = Math.max(0.2 * objectScale, actualCamDistance);
    actualFov = Math.max(5, Math.min(150, actualFov));

    if (camera.fov !== actualFov) {
        camera.fov = actualFov;
        camera.updateProjectionMatrix();
    }
    const targetPosition = new THREE.Vector3(figureGroup.position.x + actualPanX, targetFigureCenterY + actualPanY, figureGroup.position.z);
    
    // 计算相机最终位置
    const camX_relative = actualCamDistance * Math.cos(actualCamElevationRad) * Math.sin(actualCamAzimuthRad);
    const camY_relative = actualCamDistance * Math.sin(actualCamElevationRad);
    const camZ_relative = actualCamDistance * Math.cos(actualCamElevationRad) * Math.cos(actualCamAzimuthRad);
    
    const finalCamPos = new THREE.Vector3(
        targetPosition.x + camX_relative,
        targetPosition.y + camY_relative,
        targetPosition.z + camZ_relative
    );
    camera.position.copy(finalCamPos);

    // --- 新增: 应用镜头旋转的核心逻辑 ---
    // 1. 计算从相机指向目标的向量（前向向量）
    const forward = new THREE.Vector3().subVectors(targetPosition, camera.position).normalize();
    // 2. 创建一个默认的“上”向量
    const up = new THREE.Vector3(0, 1, 0);
    // 3. 根据前向向量和旋转角度，创建一个四元数
    const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(forward, actualCamRollRad);
    // 4. 将这个旋转应用到“上”向量
    up.applyQuaternion(rollQuaternion);
    // 5. 将旋转后的向量设置为相机的“上”方向
    camera.up.copy(up);
    // --- 逻辑结束 ---

    camera.lookAt(targetPosition);

    renderSingleFrame();
}

function renderSingleFrame() {
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}


// --- 录制相关函数 ---
function animateAndRecord() {
    if (!isRecording) return;
    if (currentFrame >= totalAnimFrames) {
        stopRecording();
        return;
    }
    statusDiv.textContent = `渲染中: ${currentFrame + 1} / ${totalAnimFrames}`;
    progressBar.value = ((currentFrame + 1) / totalAnimFrames) * 100;
    updateAndRenderFrame(currentFrame);
    if (capturer) {
        capturer.capture(renderer.domElement);
    }
    currentFrame++;
    if (isRecording) {
        setTimeout(animateAndRecord, 1);
    }
}

function startRecording() {
    if (isRecording) return;
    stopPreview();
    cameraActionSegments = parseActionSegmentsFromHTML();
    currentFrame = 0;
    totalAnimFrames = parseInt(numFramesInput.value);
    targetFPS = parseInt(fpsInput.value);
    initThreeJS(true);
    isRecording = true;
    startButton.disabled = true; startButton.textContent = "录制中...";
    progressBar.style.display = 'block'; progressBar.value = 0;
    statusDiv.textContent = '初始化录制...';
    const outputFormat = outputFormatInput.value;
    if (outputFormat === 'webm') capturer = new CCapture({ format: 'webm', framerate: targetFPS, quality: 90, verbose: false, workersPath: 'libs/' });
    else if (outputFormat === 'png_sequence') capturer = new CCapture({ format: 'png', framerate: targetFPS, verbose: false });
    else { statusDiv.textContent = '错误：不支持的导出格式。'; isRecording = false; startButton.disabled = false; startButton.textContent = "开始生成并导出"; progressBar.style.display = 'none'; return; }
    if (capturer) {
        capturer.start();
        statusDiv.textContent = '开始录制...';
        animateAndRecord();
    }
}

function stopRecording() {
    if (!isRecording && !capturer) { return; }
    isRecording = false;
    startButton.disabled = false; startButton.textContent = "开始生成并导出";
    progressBar.style.display = 'none';
    if (capturer) {
        statusDiv.textContent = '处理视频/帧序列... 请稍候。';
        capturer.stop();
        capturer.save(blob => {
            if (!blob) { statusDiv.textContent = '错误：处理视频失败。'; capturer = null; requestPreviewUpdate(); return; }
            let extension = (outputFormatInput.value === 'webm') ? 'webm' : 'tar';
            const filename = `animation_${Date.now()}.${extension}`;
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.style.display = 'none'; a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url); document.body.removeChild(a);
            statusDiv.textContent = `导出完成: ${filename}`;
            capturer = null;
            requestPreviewUpdate();
        });
    } else {
        requestPreviewUpdate();
    }
}


// --- 预览动画功能 ---
function previewLoop() {
    if (!isPreviewing) return;
    updateAndRenderFrame(currentFrame);
    updatePreviewUI();
    currentFrame++;
    if (currentFrame >= totalAnimFrames) {
        currentFrame = 0;
    }
    previewAnimationRequest = requestAnimationFrame(previewLoop);
}

function togglePreview() {
    if (isPreviewing) {
        pausePreview();
    } else {
        playPreview();
    }
}

function playPreview() {
    if (isRecording) return;
    isPreviewing = true;
    previewPlayPauseButton.textContent = '❚❚ 暂停预览';
    statusDiv.textContent = '预览播放中...';
    cameraActionSegments = parseActionSegmentsFromHTML();
    totalAnimFrames = parseInt(numFramesInput.value);
    updateScrubberMax();
    if (currentFrame >= totalAnimFrames) {
        currentFrame = 0;
    }
    cancelAnimationFrame(previewAnimationRequest);
    previewLoop();
}

function pausePreview() {
    isPreviewing = false;
    cancelAnimationFrame(previewAnimationRequest);
    previewPlayPauseButton.textContent = '▶ 播放预览';
    statusDiv.textContent = '预览已暂停。';
}

function stopPreview() {
    pausePreview();
    currentFrame = 0;
    updateAndRenderFrame(currentFrame);
    updatePreviewUI();
    statusDiv.textContent = '预览已停止。';
}

function updatePreviewUI() {
    previewScrubber.value = currentFrame;
    previewFrameCounter.textContent = `帧: ${currentFrame} / ${totalAnimFrames}`;
}

function updateScrubberMax() {
    totalAnimFrames = parseInt(numFramesInput.value);
    previewScrubber.max = totalAnimFrames > 0 ? totalAnimFrames - 1 : 0;
    updatePreviewUI();
}


// --- 事件监听 ---

let debounceTimeout;
function requestPreviewUpdate() {
    if (isRecording) return;
    stopPreview();
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        cameraActionSegments = parseActionSegmentsFromHTML();
        currentFrame = 0;
        initThreeJS(false);
        updateScrubberMax();
        statusDiv.textContent = '参数已更新。预览已刷新到第0帧。';
    }, 300);
}

function handleUpdateSlotsClick() {
    stopPreview();
    actionSegmentsContainer.innerHTML = createActionSegmentHTML(parseInt(numActionSlotsInput.value));
    bindDynamicActionSegmentListeners();
    requestPreviewUpdate();
}

function bindDynamicActionSegmentListeners() {
    const numSlots = parseInt(numActionSlotsInput.value);
    for (let i = 0; i < numSlots; i++) {
        const rowElements = [
            document.getElementById(`action_${i}_enabled`),
            document.getElementById(`action_${i}_type`),
            document.getElementById(`action_${i}_startFrame`),
            document.getElementById(`action_${i}_endFrame`),
            document.getElementById(`action_${i}_startValue`),
            document.getElementById(`action_${i}_endValue`),
            document.getElementById(`action_${i}_easing`)
        ];
        rowElements.forEach(input => {
            if (input) {
                input.addEventListener('change', requestPreviewUpdate);
            }
        });
    }
}

function bindEventListeners() {
    startButton.addEventListener('click', startRecording);
    updateSlotsButton.addEventListener('click', handleUpdateSlotsClick);
    previewPlayPauseButton.addEventListener('click', togglePreview);
    previewStopButton.addEventListener('click', stopPreview);
    previewScrubber.addEventListener('input', () => {
        if (isPreviewing) pausePreview();
        currentFrame = parseInt(previewScrubber.value);
        cameraActionSegments = parseActionSegmentsFromHTML();
        updateAndRenderFrame(currentFrame);
        updatePreviewUI();
    });

    const inputsToWatchForPreview = [
        figureScaleInput, lookAtHeightOffsetInput, initialDistanceInput,
        initialElevationDegInput, initialAzimuthDegInput, fovInput,
        videoWidthInput, videoHeightInput, numFramesInput
    ];
    inputsToWatchForPreview.forEach(input => {
        if (input) {
            input.addEventListener('change', requestPreviewUpdate);
        }
    });
    numFramesInput.addEventListener('change', updateScrubberMax);
    bindDynamicActionSegmentListeners(); 

    if(dragHandle) {
        dragHandle.addEventListener('mousedown', onDragStart);
    }
}


// --- 处理拖动的所有相关函数 ---
let isDragging = false;

function onDragStart(e) {
    e.preventDefault();
    isDragging = true;
    document.addEventListener('mousemove', onDragging);
    document.addEventListener('mouseup', onDragEnd);
}

function onDragging(e) {
    if (!isDragging) return;

    const controlsPanel = document.getElementById('controls');
    let newWidth = e.clientX; 

    const style = window.getComputedStyle(controlsPanel);
    const minWidth = parseInt(style.minWidth, 10);
    const maxWidth = parseInt(style.maxWidth, 10);

    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    controlsPanel.style.width = newWidth + 'px';
}

function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onDragging);
    document.removeEventListener('mouseup', onDragEnd);
    requestPreviewUpdate(); 
}


// --- 页面加载完成后的主函数 ---
window.addEventListener('DOMContentLoaded', () => {
    // 获取所有元素
    canvasEl = document.getElementById('renderCanvas');
    numFramesInput = document.getElementById('numFrames');
    figureScaleInput = document.getElementById('figureScale');
    lookAtHeightOffsetInput = document.getElementById('lookAtHeightOffset');
    initialDistanceInput = document.getElementById('initialDistance');
    initialElevationDegInput = document.getElementById('initialElevationDeg');
    initialAzimuthDegInput = document.getElementById('initialAzimuthDeg');
    fovInput = document.getElementById('fov');
    outputFormatInput = document.getElementById('outputFormat');
    videoWidthInput = document.getElementById('videoWidth');
    videoHeightInput = document.getElementById('videoHeight');
    fpsInput = document.getElementById('fps');
    startButton = document.getElementById('startButton');
    statusDiv = document.getElementById('status');
    progressBar = document.getElementById('progressBar');
    numActionSlotsInput = document.getElementById('numActionSlots');
    updateSlotsButton = document.getElementById('updateSlotsButton');
    actionSegmentsContainer = document.getElementById('actionSegmentsContainer');
    previewPlayPauseButton = document.getElementById('previewPlayPauseButton');
    previewStopButton = document.getElementById('previewStopButton');
    previewScrubber = document.getElementById('previewScrubber');
    previewFrameCounter = document.getElementById('previewFrameCounter');
    dragHandle = document.getElementById('drag-handle');

    if (canvasEl) {
        actionSegmentsContainer.innerHTML = createActionSegmentHTML(parseInt(numActionSlotsInput.value));
        bindEventListeners();
        initThreeJS(false);
        updateScrubberMax();
        statusDiv.textContent = '就绪。调整参数，预览或直接导出。';
    } else {
        console.error("Canvas 元素未找到!");
        statusDiv.textContent = '错误：无法初始化3D场景。';
    }
});