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

// --- 动画状态 ---
const baseFigureBodyHeight = 0.7;
const baseFigureHeadRadius = 0.25;
let initialFigurePosition = new THREE.Vector3();
let figureActionSegments = [];
let actualFigurePosX, actualFigurePosY, actualFigurePosZ;
let cameraActionSegments = [];
let actualCamDistance, actualCamElevationRad, actualCamAzimuthRad,
    actualPanX, actualPanY, actualFov, actualCamRollRad;

// --- 预览功能 ---
let isPreviewing = false;
let previewAnimationRequest;

// --- HTML 元素引用 ---
let canvasEl, numFramesInput, figureScaleInput, lookAtHeightOffsetInput,
    initialDistanceInput, initialElevationDegInput, initialAzimuthDegInput,
    fovInput, outputFormatInput, videoWidthInput, videoHeightInput,
    fpsInput, startButton, statusDiv, progressBar, dragHandle;

// 动态UI
let cameraFollowModeSelect,
    numCameraActionSlotsInput, updateCameraSlotsButton, cameraSegmentsContainer,
    numFigureActionSlotsInput, updateFigureSlotsButton, figureSegmentsContainer,
    previewPlayPauseButton, previewStopButton, previewScrubber, previewFrameCounter,
    saveConfigButton, loadConfigButton, configFileInput;


// --- 工具函数 ---
const lerp = (a, b, t) => a * (1 - t) + b * t;
const EasingFunctions = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
};

// --- UI 生成函数 ---
function createCameraActionHTML(count) {
    const typeOptions = `<option value="none">无</option><option value="distance">距离</option><option value="elevation">海拔角</option><option value="azimuth">方位角</option><option value="panX">Pan X</option><option value="panY">Pan Y</option><option value="fov">FOV</option><option value="roll">镜头旋转</option>`;
    return createSegmentTableHTML('camera', count, typeOptions);
}

function createFigureActionHTML(count) {
    const typeOptions = `<option value="none">无</option><option value="x_pos">X 位移</option><option value="y_pos">Y 位移</option><option value="z_pos">Z 位移</option>`;
    return createSegmentTableHTML('figure', count, typeOptions);
}

function createSegmentTableHTML(prefix, count, typeOptions) {
    let tableHTML = `<table><thead><tr><th>#</th><th>启用</th><th>类型</th><th>起始帧</th><th>结束帧</th><th>起始值</th><th>结束值</th><th>缓动</th></tr></thead><tbody>`;
    const easingOptions = Object.keys(EasingFunctions).map(n => `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`).join('');
    for (let i = 0; i < count; i++) {
        tableHTML += `<tr>
            <td>${i + 1}</td>
            <td><input type="checkbox" id="${prefix}_${i}_enabled"></td>
            <td><select id="${prefix}_${i}_type">${typeOptions}</select></td>
            <td><input type="number" id="${prefix}_${i}_startFrame" value="0" min="0"></td>
            <td><input type="number" id="${prefix}_${i}_endFrame" value="0" min="0"></td>
            <td><input type="number" id="${prefix}_${i}_startValue" value="0" step="any"></td>
            <td><input type="number" id="${prefix}_${i}_endValue" value="0" step="any"></td>
            <td><select id="${prefix}_${i}_easing">${easingOptions}</select></td>
        </tr>`;
    }
    return tableHTML + `</tbody></table>`;
}

// --- 参数解析函数 ---
function gatherSegmentsFromUI(prefix, count) {
    const segments = [];
    for (let i = 0; i < count; i++) {
        const enabled = document.getElementById(`${prefix}_${i}_enabled`);
        if (enabled) {
             segments.push({
                enabled: enabled.checked,
                type: document.getElementById(`${prefix}_${i}_type`).value,
                startFrame: parseInt(document.getElementById(`${prefix}_${i}_startFrame`).value),
                endFrame: parseInt(document.getElementById(`${prefix}_${i}_endFrame`).value),
                startValue: parseFloat(document.getElementById(`${prefix}_${i}_startValue`).value),
                endValue: parseFloat(document.getElementById(`${prefix}_${i}_endValue`).value),
                easing: document.getElementById(`${prefix}_${i}_easing`).value,
            });
        }
    }
    return segments;
}

function parseActiveSegments(segments) {
    const activeSegments = [];
    segments.forEach(seg => {
        if (seg.enabled && seg.type !== 'none' && !isNaN(seg.startFrame) && !isNaN(seg.endFrame) && !isNaN(seg.startValue) && !isNaN(seg.endValue) && seg.startFrame <= seg.endFrame) {
            const newSeg = {...seg};
            if (['elevation', 'azimuth', 'roll'].includes(newSeg.type)) {
                newSeg.startValueDeg = newSeg.startValue;
                newSeg.endValueDeg = newSeg.endValue;
            }
            activeSegments.push(newSeg);
        }
    });
    return activeSegments;
}


// --- 核心动画逻辑 (无改动) ---
function createFigure(scale){if(figureGroup&&figureGroup.parent){scene.remove(figureGroup);figureGroup.traverse(child=>{if(child.isMesh){child.geometry?.dispose();child.material?.dispose();}});}figureGroup=new THREE.Group();const headRadius=baseFigureHeadRadius*scale;const bodyHeight=baseFigureBodyHeight*scale;const bodyWidth=0.5*scale;const bodyDepth=0.25*scale;const limbLength=0.6*scale;const limbRadius=0.08*scale;const headMat=new THREE.MeshStandardMaterial({color:0xffff00,roughness:0.6});const bodyMat=new THREE.MeshStandardMaterial({color:0x00ff00,roughness:0.7});const limbMat=new THREE.MeshStandardMaterial({color:0xff0000,roughness:0.5});const head=new THREE.Mesh(new THREE.SphereGeometry(headRadius,32,16),headMat);head.position.y=bodyHeight/2+headRadius;head.castShadow=true;const featureMaterial=new THREE.MeshStandardMaterial({color:0x222222,roughness:0.8});const eyeRadius=headRadius*0.15;const eyeGeometry=new THREE.SphereGeometry(eyeRadius,12,8);const leftEye=new THREE.Mesh(eyeGeometry,featureMaterial);leftEye.position.set(-headRadius*0.4,headRadius*0.2,headRadius*0.85);head.add(leftEye);const rightEye=leftEye.clone();rightEye.position.x=-leftEye.position.x;head.add(rightEye);const mouthWidth=headRadius*0.5,mouthHeight=headRadius*0.1,mouthDepth=headRadius*0.1;const mouthGeometry=new THREE.BoxGeometry(mouthWidth,mouthHeight,mouthDepth);const mouth=new THREE.Mesh(mouthGeometry,featureMaterial);mouth.position.set(0,-headRadius*0.35,headRadius*0.88);head.add(mouth);const earRadius=headRadius*0.4,earThickness=headRadius*0.1;const earGeometry=new THREE.CylinderGeometry(earRadius,earRadius,earThickness,16);const leftEar=new THREE.Mesh(earGeometry,headMat);leftEar.position.set(-headRadius*0.9,headRadius*0.2,-headRadius*0.1);leftEar.rotation.z=Math.PI/2;head.add(leftEar);const rightEar=leftEar.clone();rightEar.position.x=-leftEar.position.x;head.add(rightEar);figureGroup.add(head);const body=new THREE.Mesh(new THREE.BoxGeometry(bodyWidth,bodyHeight,bodyDepth),bodyMat);body.castShadow=true;figureGroup.add(body);[{x:-bodyWidth/2-limbRadius,y:bodyHeight/2-limbLength*0.3,arm:true},{x:bodyWidth/2+limbRadius,y:bodyHeight/2-limbLength*0.3,arm:true},{x:-bodyWidth/4,y:-bodyHeight/2,arm:false},{x:bodyWidth/4,y:-bodyHeight/2,arm:false}].forEach(p=>{const limb=new THREE.Mesh(new THREE.CylinderGeometry(limbRadius,limbRadius,limbLength,16),limbMat);limb.position.y=p.y-(p.arm?limbLength/2:0);limb.position.x=p.x;limb.castShadow=true;figureGroup.add(limb);});const lowestPointY=-bodyHeight/2-limbLength/2;initialFigurePosition.set(0,-lowestPointY+0.01,0);figureGroup.position.copy(initialFigurePosition);scene.add(figureGroup);}
function initThreeJS(forRecording=false){const width=parseInt(videoWidthInput.value),height=parseInt(videoHeightInput.value);if(!renderer||renderer.domElement.width!==width||renderer.domElement.height!==height){if(renderer)renderer.dispose();renderer=new THREE.WebGLRenderer({canvas:canvasEl,antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.setPixelRatio(window.devicePixelRatio>1&&!forRecording?2:1);}renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;if(scene){while(scene.children.length>0){const o=scene.children[0];if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}if(o.texture)o.texture.dispose();scene.remove(o);}if(scene.background)scene.background.dispose();}scene=new THREE.Scene();const aspect=width/height,fov=parseFloat(fovInput.value);if(!camera||camera.aspect!==aspect)camera=new THREE.PerspectiveCamera(fov,aspect,0.1,3000);else{camera.fov=fov;camera.aspect=aspect;camera.updateProjectionMatrix();}scene.add(new THREE.AmbientLight(0xffffff,0.8));directionalLight=new THREE.DirectionalLight(0xffffff,1.5);directionalLight.position.set(25,40,30);directionalLight.castShadow=true;Object.assign(directionalLight.shadow.camera,{near:0.5,far:150,left:-50,right:50,top:50,bottom:-50});directionalLight.shadow.mapSize.set(2048,2048);directionalLight.shadow.bias=-0.0005;scene.add(directionalLight);createFigure(parseFloat(figureScaleInput.value));const groundSize=100;ground=new THREE.Mesh(new THREE.PlaneGeometry(groundSize,groundSize),new THREE.MeshStandardMaterial({color:0x666666,roughness:0.95}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);const gridHelper=new THREE.GridHelper(groundSize,groundSize/2,0x000000,0x404040);gridHelper.position.y=0.01;scene.add(gridHelper);new THREE.CubeTextureLoader().setPath('textures/skybox/').load(['px.png','nx.png','py.png','ny.png','pz.png','nz.png'],tex=>{scene.background=tex;renderSingleFrame();},undefined,()=>{scene.background=new THREE.Color(0x607d8b);renderSingleFrame();});const distMat=new THREE.MeshStandardMaterial({color:0x95a5a6,roughness:0.9});for(let i=0;i<30;i++){const s=Math.random()*6+4,angle=Math.random()*Math.PI*2,dist=groundSize/2*(0.8+Math.random()*0.4);const o=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),distMat);o.position.set(Math.cos(angle)*dist,s/2,Math.sin(angle)*dist);o.castShadow=o.receiveShadow=true;scene.add(o);}if(forRecording||!isPreviewing)resetAllAnimationStates();updateAndRenderFrame(currentFrame);}
function resetAllAnimationStates(){actualFigurePosX=initialFigurePosition.x;actualFigurePosY=initialFigurePosition.y;actualFigurePosZ=initialFigurePosition.z;actualCamDistance=parseFloat(initialDistanceInput.value);actualCamElevationRad=parseFloat(initialElevationDegInput.value)*(Math.PI/180);actualCamAzimuthRad=parseFloat(initialAzimuthDegInput.value)*(Math.PI/180);actualPanX=0;actualPanY=0;actualFov=parseFloat(fovInput.value);actualCamRollRad=0;}
function updateAndRenderFrame(frame){if(!figureGroup||!scene)return;resetAllAnimationStates();for(let f=0;f<=frame;f++){let states={figX:actualFigurePosX,figY:actualFigurePosY,figZ:actualFigurePosZ,dist:actualCamDistance,elev:actualCamElevationRad,azim:actualCamAzimuthRad,panX:actualPanX,panY:actualPanY,fov:actualFov,roll:actualCamRollRad};const apply=(segments)=>{segments.forEach(seg=>{if(f>=seg.startFrame&&f<=seg.endFrame){const progress=seg.endFrame===seg.startFrame?1:(f-seg.startFrame)/(seg.endFrame-seg.startFrame);const eased=EasingFunctions[seg.easing](progress);let startRad,endRad;switch(seg.type){case'x_pos':states.figX=lerp(seg.startValue,seg.endValue,eased);break;case'y_pos':states.figY=lerp(initialFigurePosition.y+seg.startValue,initialFigurePosition.y+seg.endValue,eased);break;case'z_pos':states.figZ=lerp(seg.startValue,seg.endValue,eased);break;case'distance':states.dist=lerp(seg.startValue,seg.endValue,eased);break;case'panX':states.panX=lerp(seg.startValue,seg.endValue,eased);break;case'panY':states.panY=lerp(seg.startValue,seg.endValue,eased);break;case'fov':states.fov=lerp(seg.startValue,seg.endValue,eased);break;case'elevation':startRad=seg.startValueDeg*(Math.PI/180);endRad=seg.endValueDeg*(Math.PI/180);states.elev=lerp(startRad,endRad,eased);break;case'azimuth':startRad=seg.startValueDeg*(Math.PI/180);endRad=seg.endValueDeg*(Math.PI/180);states.azim=lerp(startRad,endRad,eased);break;case'roll':startRad=seg.startValueDeg*(Math.PI/180);endRad=seg.endValueDeg*(Math.PI/180);states.roll=lerp(startRad,endRad,eased);break;}}});};apply(figureActionSegments);apply(cameraActionSegments);({figX:actualFigurePosX,figY:actualFigurePosY,figZ:actualFigurePosZ,dist:actualCamDistance,elev:actualCamElevationRad,azim:actualCamAzimuthRad,panX:actualPanX,panY:actualPanY,fov:actualFov,roll:actualCamRollRad}=states);}figureGroup.position.set(actualFigurePosX,actualFigurePosY,actualFigurePosZ);const followMode=cameraFollowModeSelect.value;const baseLookAtTarget=followMode==='follow'?figureGroup.position:initialFigurePosition;const finalLookAtTarget=new THREE.Vector3(baseLookAtTarget.x+actualPanX,baseLookAtTarget.y+parseFloat(lookAtHeightOffsetInput.value)+actualPanY,baseLookAtTarget.z);actualCamElevationRad=Math.max(-Math.PI/2+0.01,Math.min(Math.PI/2-0.01,actualCamElevationRad));actualCamDistance=Math.max(0.2*parseFloat(figureScaleInput.value),actualCamDistance);if(camera.fov!==actualFov){camera.fov=actualFov;camera.updateProjectionMatrix();}const camX=finalLookAtTarget.x+actualCamDistance*Math.cos(actualCamElevationRad)*Math.sin(actualCamAzimuthRad);const camY=finalLookAtTarget.y+actualCamDistance*Math.sin(actualCamElevationRad);const camZ=finalLookAtTarget.z+actualCamDistance*Math.cos(actualCamElevationRad)*Math.cos(actualCamAzimuthRad);camera.position.set(camX,camY,camZ);const forward=new THREE.Vector3().subVectors(finalLookAtTarget,camera.position).normalize();camera.up.set(0,1,0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(forward,actualCamRollRad));camera.lookAt(finalLookAtTarget);renderSingleFrame();}
function renderSingleFrame(){if(renderer&&scene&&camera)renderer.render(scene,camera);}
function animateAndRecord(){if(!isRecording)return;if(currentFrame>=totalAnimFrames){stopRecording();return;}statusDiv.textContent=`渲染中: ${currentFrame+1}/${totalAnimFrames}`;progressBar.value=((currentFrame+1)/totalAnimFrames)*100;updateAndRenderFrame(currentFrame);capturer?.capture(renderer.domElement);currentFrame++;if(isRecording)setTimeout(animateAndRecord,1);}
function startRecording(){if(isRecording)return;stopPreview();figureActionSegments=parseActiveSegments(gatherSegmentsFromUI('figure',parseInt(numFigureActionSlotsInput.value)));cameraActionSegments=parseActiveSegments(gatherSegmentsFromUI('camera',parseInt(numCameraActionSlotsInput.value)));currentFrame=0;totalAnimFrames=parseInt(numFramesInput.value);targetFPS=parseInt(fpsInput.value);initThreeJS(true);isRecording=true;startButton.disabled=true;startButton.textContent="录制中...";progressBar.style.display='block';progressBar.value=0;statusDiv.textContent='初始化录制...';const format=outputFormatInput.value;if(format==='webm')capturer=new CCapture({format:'webm',framerate:targetFPS,quality:90,workersPath:'libs/'});else if(format==='png_sequence')capturer=new CCapture({format:'png',framerate:targetFPS});else return;capturer.start();statusDiv.textContent='开始录制...';animateAndRecord();}
function stopRecording(){if(!isRecording&&!capturer)return;isRecording=false;startButton.disabled=false;startButton.textContent="开始生成并导出";progressBar.style.display='none';if(capturer){statusDiv.textContent='处理视频/帧序列...';capturer.stop();capturer.save(blob=>{if(!blob){statusDiv.textContent='错误:处理视频失败。';capturer=null;requestPreviewUpdate();return;}const ext=outputFormatInput.value==='webm'?'webm':'tar';const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`animation_${Date.now()}.${ext}`;a.click();URL.revokeObjectURL(a.href);statusDiv.textContent=`导出完成: ${a.download}`;capturer=null;requestPreviewUpdate();});}else{requestPreviewUpdate();}}
function previewLoop(){if(!isPreviewing)return;updateAndRenderFrame(currentFrame);updatePreviewUI();currentFrame++;if(currentFrame>=totalAnimFrames)currentFrame=0;previewAnimationRequest=requestAnimationFrame(previewLoop);}
function togglePreview(){isPreviewing?pausePreview():playPreview();}
function playPreview(){if(isRecording)return;isPreviewing=true;previewPlayPauseButton.textContent='❚❚ 暂停预览';statusDiv.textContent='预览播放中...';figureActionSegments=parseActiveSegments(gatherSegmentsFromUI('figure',parseInt(numFigureActionSlotsInput.value)));cameraActionSegments=parseActiveSegments(gatherSegmentsFromUI('camera',parseInt(numCameraActionSlotsInput.value)));totalAnimFrames=parseInt(numFramesInput.value);updateScrubberMax();if(currentFrame>=totalAnimFrames)currentFrame=0;cancelAnimationFrame(previewAnimationRequest);previewLoop();}
function pausePreview(){isPreviewing=false;cancelAnimationFrame(previewAnimationRequest);previewPlayPauseButton.textContent='▶ 播放预览';statusDiv.textContent='预览已暂停。';}
function stopPreview(){pausePreview();currentFrame=0;updateAndRenderFrame(currentFrame);updatePreviewUI();statusDiv.textContent='预览已停止。';}
function updatePreviewUI(){previewScrubber.value=currentFrame;previewFrameCounter.textContent=`帧: ${currentFrame}/${totalAnimFrames}`;}
function updateScrubberMax(){totalAnimFrames=parseInt(numFramesInput.value);previewScrubber.max=totalAnimFrames>0?totalAnimFrames-1:0;updatePreviewUI();}
let debounceTimeout;function requestPreviewUpdate(){if(isRecording)return;stopPreview();clearTimeout(debounceTimeout);debounceTimeout=setTimeout(()=>{figureActionSegments=parseActiveSegments(gatherSegmentsFromUI('figure',parseInt(numFigureActionSlotsInput.value)));cameraActionSegments=parseActiveSegments(gatherSegmentsFromUI('camera',parseInt(numCameraActionSlotsInput.value)));currentFrame=0;initThreeJS(false);updateScrubberMax();statusDiv.textContent='参数已更新。预览已刷新。';},300);}
function handleUpdateCameraSlotsClick(){stopPreview();cameraSegmentsContainer.innerHTML=createCameraActionHTML(parseInt(numCameraActionSlotsInput.value));bindDynamicSegmentListeners('camera',parseInt(numCameraActionSlotsInput.value));requestPreviewUpdate();}
function handleUpdateFigureSlotsClick(){stopPreview();figureSegmentsContainer.innerHTML=createFigureActionHTML(parseInt(numFigureActionSlotsInput.value));bindDynamicSegmentListeners('figure',parseInt(numFigureActionSlotsInput.value));requestPreviewUpdate();}
let isDragging=false;function onDragStart(e){e.preventDefault();isDragging=true;document.addEventListener('mousemove',onDragging);document.addEventListener('mouseup',onDragEnd);}function onDragging(e){if(!isDragging)return;const c=document.getElementById('controls');let n=e.clientX;const s=window.getComputedStyle(c);const min=parseInt(s.minWidth,10);const max=parseInt(s.maxWidth,10);if(n<min)n=min;if(n>max)n=max;c.style.width=n+'px';}function onDragEnd(){if(!isDragging)return;isDragging=false;document.removeEventListener('mousemove',onDragging);document.removeEventListener('mouseup',onDragEnd);requestPreviewUpdate();}

// --- 配置保存/读取功能 ---

function saveConfiguration() {
    const config = {
        version: 1.0,
        figureScale: parseFloat(figureScaleInput.value),
        cameraFollowMode: cameraFollowModeSelect.value,
        lookAtHeightOffset: parseFloat(lookAtHeightOffsetInput.value),
        initialDistance: parseFloat(initialDistanceInput.value),
        initialElevationDeg: parseFloat(initialElevationDegInput.value),
        initialAzimuthDeg: parseFloat(initialAzimuthDegInput.value),
        fov: parseFloat(fovInput.value),
        numFrames: parseInt(numFramesInput.value),
        videoWidth: parseInt(videoWidthInput.value),
        videoHeight: parseInt(videoHeightInput.value),
        fps: parseInt(fpsInput.value),
        outputFormat: outputFormatInput.value,
        numFigureActionSlots: parseInt(numFigureActionSlotsInput.value),
        numCameraActionSlots: parseInt(numCameraActionSlotsInput.value),
        figureSegments: gatherSegmentsFromUI('figure', parseInt(numFigureActionSlotsInput.value)),
        cameraSegments: gatherSegmentsFromUI('camera', parseInt(numCameraActionSlotsInput.value)),
    };
    const configString = JSON.stringify(config, null, 2);
    const blob = new Blob([configString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scene-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusDiv.textContent = '配置已保存！';
}

function loadConfiguration(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);
            applyConfiguration(config);
        } catch (error) {
            console.error("加载配置失败:", error);
            statusDiv.textContent = '错误: 载入的JSON文件格式无效。';
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// 关键修正: 重构 applyConfiguration 函数
function applyConfiguration(config) {
    stopPreview();
    clearTimeout(debounceTimeout);

    // 步骤 1. 应用所有静态值
    figureScaleInput.value = config.figureScale ?? 1;
    cameraFollowModeSelect.value = config.cameraFollowMode ?? 'follow';
    lookAtHeightOffsetInput.value = config.lookAtHeightOffset ?? 0;
    initialDistanceInput.value = config.initialDistance ?? 7;
    initialElevationDegInput.value = config.initialElevationDeg ?? 10;
    initialAzimuthDegInput.value = config.initialAzimuthDeg ?? 0;
    fovInput.value = config.fov ?? 50;
    numFramesInput.value = config.numFrames ?? 300;
    videoWidthInput.value = config.videoWidth ?? 640;
    videoHeightInput.value = config.videoHeight ?? 480;
    fpsInput.value = config.fps ?? 30;
    outputFormatInput.value = config.outputFormat ?? 'webm';
    numFigureActionSlotsInput.value = config.figureSegments?.length ?? 1;
    numCameraActionSlotsInput.value = config.cameraSegments?.length ?? 1;

    // 步骤 2. 仅重建UI表格
    figureSegmentsContainer.innerHTML = createFigureActionHTML(parseInt(numFigureActionSlotsInput.value));
    cameraSegmentsContainer.innerHTML = createCameraActionHTML(parseInt(numCameraActionSlotsInput.value));
    
    // 步骤 3. 定义一个独立的填充函数
    const populateSegmentsFromData = (prefix, segmentsData) => {
        if (segmentsData) {
            segmentsData.forEach((seg, i) => {
                document.getElementById(`${prefix}_${i}_enabled`).checked = seg.enabled ?? false;
                document.getElementById(`${prefix}_${i}_type`).value = seg.type ?? 'none';
                document.getElementById(`${prefix}_${i}_startFrame`).value = seg.startFrame ?? 0;
                document.getElementById(`${prefix}_${i}_endFrame`).value = seg.endFrame ?? 0;
                document.getElementById(`${prefix}_${i}_startValue`).value = seg.startValue ?? 0;
                document.getElementById(`${prefix}_${i}_endValue`).value = seg.endValue ?? 0;
                document.getElementById(`${prefix}_${i}_easing`).value = seg.easing ?? 'linear';
            });
        }
    };

    // 步骤 4. 调用填充函数，用数据填充UI
    populateSegmentsFromData('figure', config.figureSegments);
    populateSegmentsFromData('camera', config.cameraSegments);
    
    // 步骤 5. 在UI完全建立和填充后，才绑定事件监听器
    bindDynamicSegmentListeners('figure', parseInt(numFigureActionSlotsInput.value));
    bindDynamicSegmentListeners('camera', parseInt(numCameraActionSlotsInput.value));
    
    // 步骤 6. 最后，直接、同步地更新所有状态并刷新场景
    figureActionSegments = parseActiveSegments(gatherSegmentsFromUI('figure', parseInt(numFigureActionSlotsInput.value)));
    cameraActionSegments = parseActiveSegments(gatherSegmentsFromUI('camera', parseInt(numCameraActionSlotsInput.value)));
    currentFrame = 0;
    initThreeJS(false);
    updateScrubberMax();
    statusDiv.textContent = '配置已成功载入！';
}


// --- 事件绑定 ---
function bindDynamicSegmentListeners(prefix, count) {
    for (let i = 0; i < count; i++) {
        ['enabled', 'type', 'startFrame', 'endFrame', 'startValue', 'endValue', 'easing'].forEach(p => {
            const elem = document.getElementById(`${prefix}_${i}_${p}`);
            if (elem) elem.addEventListener('change', requestPreviewUpdate);
        });
    }
}

function bindStaticEventListeners() {
    startButton.addEventListener('click', startRecording);
    updateCameraSlotsButton.addEventListener('click', handleUpdateCameraSlotsClick);
    updateFigureSlotsButton.addEventListener('click', handleUpdateFigureSlotsClick);
    previewPlayPauseButton.addEventListener('click', togglePreview);
    previewStopButton.addEventListener('click', stopPreview);
    previewScrubber.addEventListener('input', () => {
        if (isPreviewing) pausePreview();
        currentFrame = parseInt(previewScrubber.value);
        figureActionSegments = parseActiveSegments(gatherSegmentsFromUI('figure', parseInt(numFigureActionSlotsInput.value)));
        cameraActionSegments = parseActiveSegments(gatherSegmentsFromUI('camera', parseInt(numCameraActionSlotsInput.value)));
        updateAndRenderFrame(currentFrame);
        updatePreviewUI();
    });
    saveConfigButton.addEventListener('click', saveConfiguration);
    loadConfigButton.addEventListener('click', () => configFileInput.click());
    configFileInput.addEventListener('change', loadConfiguration);
    const staticInputs = [figureScaleInput, lookAtHeightOffsetInput, initialDistanceInput, initialElevationDegInput, initialAzimuthDegInput, fovInput, videoWidthInput, videoHeightInput, numFramesInput, cameraFollowModeSelect];
    staticInputs.forEach(i => {
        if (i) i.addEventListener('change', requestPreviewUpdate);
    });
    numFramesInput.addEventListener('change', updateScrubberMax);
    if (dragHandle) dragHandle.addEventListener('mousedown', onDragStart);
}

// --- 页面加载 ---
window.addEventListener('DOMContentLoaded', () => {
    // 获取所有元素引用
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
    dragHandle = document.getElementById('drag-handle');
    cameraFollowModeSelect = document.getElementById('cameraFollowMode');
    numCameraActionSlotsInput = document.getElementById('numCameraActionSlots');
    updateCameraSlotsButton = document.getElementById('updateCameraSlotsButton');
    cameraSegmentsContainer = document.getElementById('cameraSegmentsContainer');
    numFigureActionSlotsInput = document.getElementById('numFigureActionSlots');
    updateFigureSlotsButton = document.getElementById('updateFigureSlotsButton');
    figureSegmentsContainer = document.getElementById('figureSegmentsContainer');
    previewPlayPauseButton = document.getElementById('previewPlayPauseButton');
    previewStopButton = document.getElementById('previewStopButton');
    previewScrubber = document.getElementById('previewScrubber');
    previewFrameCounter = document.getElementById('previewFrameCounter');
    saveConfigButton = document.getElementById('saveConfigButton');
    loadConfigButton = document.getElementById('loadConfigButton');
    configFileInput = document.getElementById('configFileInput');

    if (canvasEl) {
        cameraSegmentsContainer.innerHTML = createCameraActionHTML(parseInt(numCameraActionSlotsInput.value));
        figureSegmentsContainer.innerHTML = createFigureActionHTML(parseInt(numFigureActionSlotsInput.value));
        
        bindStaticEventListeners();
        bindDynamicSegmentListeners('camera', parseInt(numCameraActionSlotsInput.value));
        bindDynamicSegmentListeners('figure', parseInt(numFigureActionSlotsInput.value));
        
        initThreeJS(false);
        updateScrubberMax();
        statusDiv.textContent = '就绪。请设置动画参数。';
    } else {
        console.error("Canvas 元素未找到!");
        statusDiv.textContent = '错误：无法初始化3D场景。';
    }
});