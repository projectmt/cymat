import React, { useEffect, useRef, useState } from 'react';
import { Settings, Play, Pause, Mic, Zap } from 'lucide-react';
import * as THREE from 'three';

const CymaticsVisualizer = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const particlesRef = useRef(null);
  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, isDragging: false, lastX: 0, lastY: 0 });
  const cameraRotationRef = useRef({ theta: 0, phi: Math.PI / 2 });
  const streamRef = useRef(null);
  const orbsRef = useRef([]);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [settings, setSettings] = useState({
    frequency: 432,
    audioSource: 'generator',
    particleCount: 100000,
    visualStyle: 'organic',
    color1: '#ff6b9d',
    color2: '#c060ff',
    sensitivity: 1.5,
    glowIntensity: 1.2,
    zoom: 300,
    showOrbs: true,
    particleSpread: 1.0,
    selectedMicId: 'default'
  });

  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
      } catch (err) {
        console.error('Error getting audio devices:', err);
      }
    };
    
    getAudioDevices();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0015);
    
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      transparent: true,
      opacity: 0.6
    });
    
    const starsVertices = [];
    for (let i = 0; i < 5000; i++) {
      const x = (Math.random() - 0.5) * 3000;
      const y = (Math.random() - 0.5) * 3000;
      const z = (Math.random() - 0.5) * 3000;
      starsVertices.push(x, y, z);
    }
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
    
    scene.fog = new THREE.FogExp2(0x0a0015, 0.0008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      5000
    );
    updateCameraPosition(camera, cameraRotationRef.current, settings.zoom);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.3);
    scene.add(ambientLight);

    const centerLight = new THREE.PointLight(0xffffff, 2, 500);
    centerLight.position.set(0, 0, 0);
    scene.add(centerLight);

    createParticles(scene, settings.particleCount, settings.visualStyle, settings.particleSpread);
    if (settings.showOrbs) {
      createGlowingOrbs(scene, settings);
    }

    const handleMouseDown = (event) => {
      if (event.target.closest('.settings-panel')) return;
      mouseRef.current.isDragging = true;
      mouseRef.current.lastX = event.clientX;
      mouseRef.current.lastY = event.clientY;
    };

    const handleMouseMove = (event) => {
      if (event.target.closest('.settings-panel')) return;
      if (mouseRef.current.isDragging) {
        const deltaX = event.clientX - mouseRef.current.lastX;
        const deltaY = event.clientY - mouseRef.current.lastY;
        
        cameraRotationRef.current.theta -= deltaX * 0.005;
        cameraRotationRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraRotationRef.current.phi + deltaY * 0.005));
        
        mouseRef.current.lastX = event.clientX;
        mouseRef.current.lastY = event.clientY;
      }
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleTouchStart = (event) => {
      if (event.target.closest('.settings-panel')) return;
      if (event.touches.length === 1) {
        mouseRef.current.isDragging = true;
        mouseRef.current.lastX = event.touches[0].clientX;
        mouseRef.current.lastY = event.touches[0].clientY;
      } else if (event.touches.length === 2) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        event.target.dataset.lastPinchDistance = distance;
      }
    };

    const handleTouchMove = (event) => {
      if (event.target.closest('.settings-panel')) return;
      if (event.touches.length === 1 && mouseRef.current.isDragging) {
        const deltaX = event.touches[0].clientX - mouseRef.current.lastX;
        const deltaY = event.touches[0].clientY - mouseRef.current.lastY;
        
        cameraRotationRef.current.theta -= deltaX * 0.005;
        cameraRotationRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraRotationRef.current.phi + deltaY * 0.005));
        
        mouseRef.current.lastX = event.touches[0].clientX;
        mouseRef.current.lastY = event.touches[0].clientY;
      } else if (event.touches.length === 2) {
        event.preventDefault();
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        const lastDistance = parseFloat(event.target.dataset.lastPinchDistance || distance);
        const delta = (lastDistance - distance) * 0.5;
        setSettings(prev => ({
          ...prev,
          zoom: Math.max(50, Math.min(1000, prev.zoom + delta))
        }));
        event.target.dataset.lastPinchDistance = distance;
      }
    };

    const handleTouchEnd = () => {
      mouseRef.current.isDragging = false;
    };

    const handleWheel = (event) => {
      if (event.target.closest('.settings-panel')) return;
      event.preventDefault();
      const delta = event.deltaY * 0.2;
      setSettings(prev => ({
        ...prev,
        zoom: Math.max(50, Math.min(1000, prev.zoom + delta))
      }));
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('wheel', handleWheel, { passive: false });

    let time = 0;
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      time += 0.01;

      if (cameraRef.current) {
        updateCameraPosition(cameraRef.current, cameraRotationRef.current, settings.zoom);
      }

      stars.rotation.y = time * 0.005;
      stars.rotation.x = time * 0.003;

      if (particlesRef.current) {
        updateParticles(time, settings);
      }

      if (settings.showOrbs) {
        updateOrbs(time, settings);
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('wheel', handleWheel);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [settings.zoom, isPlaying, showSettings, settings.frequency, settings.sensitivity, settings.glowIntensity, settings.color1, settings.color2]);

  useEffect(() => {
    if (sceneRef.current && particlesRef.current) {
      sceneRef.current.remove(particlesRef.current);
      createParticles(sceneRef.current, settings.particleCount, settings.visualStyle, settings.particleSpread);
    }
  }, [settings.particleCount, settings.visualStyle, settings.particleSpread]);

  useEffect(() => {
    if (sceneRef.current) {
      orbsRef.current.forEach(orb => {
        sceneRef.current.remove(orb);
      });
      orbsRef.current = [];
      
      if (settings.showOrbs) {
        createGlowingOrbs(sceneRef.current, settings);
      }
    }
  }, [settings.showOrbs]);

  const updateCameraPosition = (camera, rotation, zoom) => {
    const radius = zoom;
    camera.position.x = radius * Math.sin(rotation.phi) * Math.cos(rotation.theta);
    camera.position.y = radius * Math.cos(rotation.phi);
    camera.position.z = radius * Math.sin(rotation.phi) * Math.sin(rotation.theta);
    camera.lookAt(0, 0, 0);
  };

  const createGlowingOrbs = (scene, config) => {
    const c1 = new THREE.Color(config.color1);
    const c2 = new THREE.Color(config.color2);
    
    for (let i = 0; i < 6; i++) {
      const orbGeometry = new THREE.SphereGeometry(3 + Math.random() * 4, 32, 32);
      const orbMaterial = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? c1 : c2,
        transparent: true,
        opacity: 0.7
      });
      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      
      const glowGeometry = new THREE.SphereGeometry(5 + Math.random() * 6, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? c1 : c2,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      orb.add(glow);
      
      const radius = 60 + i * 20;
      const angle = (i / 6) * Math.PI * 2;
      orb.userData = {
        radius: radius,
        speed: 0.15 + Math.random() * 0.2,
        offset: angle,
        bobSpeed: 0.4 + Math.random() * 0.4,
        bobAmount: 8 + Math.random() * 12
      };
      
      scene.add(orb);
      orbsRef.current.push(orb);
    }
  };

  const updateOrbs = (time, config) => {
    orbsRef.current.forEach((orb, index) => {
      const data = orb.userData;
      const angle = time * data.speed + data.offset;
      orb.position.x = Math.cos(angle) * data.radius;
      orb.position.z = Math.sin(angle) * data.radius;
      orb.position.y = Math.sin(time * data.bobSpeed) * data.bobAmount;
      
      orb.rotation.y = time * 0.5;
      
      const scale = 1 + Math.sin(time * 2 + index) * 0.2;
      orb.scale.set(scale, scale, scale);
      
      if (orb.children[0]) {
        const glowScale = 1 + Math.sin(time * 3 + index) * 0.3;
        orb.children[0].scale.set(glowScale, glowScale, glowScale);
      }
    });
  };

  const createParticles = (scene, count, style, spread) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const originalPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities = new Float32Array(count * 3);

    const c1 = new THREE.Color(settings.color1);
    const c2 = new THREE.Color(settings.color2);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      if (style === 'geometric') {
        const layer = Math.floor(i / (count / 8));
        const angle = (i % (count / 8)) / (count / 8) * Math.PI * 2;
        const radius = (10 + layer * 15) * spread;
        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = (Math.random() - 0.5) * 5 * spread;
        positions[i3 + 2] = Math.sin(angle) * radius;
      } else if (style === 'ethereal') {
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;
        const radius = (30 + Math.random() * 50) * spread;
        positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
        positions[i3 + 2] = radius * Math.cos(phi);
      } else {
        const rand = Math.random();
        if (rand < 0.7) {
          const angle = Math.random() * Math.PI * 2;
          const radiusNorm = Math.pow(Math.random(), 0.25);
          const radius = radiusNorm * 250 * spread;
          const spiralOffset = angle + radius * 0.03;
          
          positions[i3] = Math.cos(spiralOffset) * radius;
          positions[i3 + 2] = Math.sin(spiralOffset) * radius;
          
          const heightFalloff = Math.exp(-radius * 0.008);
          positions[i3 + 1] = (Math.random() - 0.5) * 15 * heightFalloff * spread;
        } else {
          const phi = Math.acos(-1 + (2 * Math.random()));
          const theta = Math.random() * Math.PI * 2;
          const radius = (40 + Math.random() * 100) * spread;
          positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
          positions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
          positions[i3 + 2] = radius * Math.cos(phi);
        }
      }

      originalPositions[i3] = positions[i3];
      originalPositions[i3 + 1] = positions[i3 + 1];
      originalPositions[i3 + 2] = positions[i3 + 2];

      const distFromCenter = Math.sqrt(
        positions[i3] * positions[i3] + 
        positions[i3 + 1] * positions[i3 + 1] + 
        positions[i3 + 2] * positions[i3 + 2]
      );
      const colorMix = Math.random();
      const particleColor = new THREE.Color().lerpColors(c1, c2, colorMix);
      const brightness = 1 - Math.min(distFromCenter / (250 * spread), 0.7);
      
      colors[i3] = particleColor.r * brightness;
      colors[i3 + 1] = particleColor.g * brightness;
      colors[i3 + 2] = particleColor.b * brightness;
      
      sizes[i] = (Math.random() * 1.5 + 0.3) * (1 + brightness);
      
      velocities[i3] = (Math.random() - 0.5) * 0.05;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.05;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    particlesRef.current = particles;
    scene.add(particles);
  };

  const updateParticles = (time, config) => {
    if (!particlesRef.current) return;

    const positions = particlesRef.current.geometry.attributes.position.array;
    const originalPositions = particlesRef.current.geometry.attributes.originalPosition.array;
    const colors = particlesRef.current.geometry.attributes.color.array;
    const sizes = particlesRef.current.geometry.attributes.size.array;

    const c1 = new THREE.Color(config.color1);
    const c2 = new THREE.Color(config.color2);
    const freq = config.frequency / 400;
    const waveSpeed = time * freq * 1.5;

    for (let i = 0; i < positions.length; i += 3) {
      const origX = originalPositions[i];
      const origY = originalPositions[i + 1];
      const origZ = originalPositions[i + 2];
      
      const distFromCenter = Math.sqrt(origX * origX + origY * origY + origZ * origZ);
      const angleXZ = Math.atan2(origZ, origX);
      
      const modes = Math.floor(freq * 6) + 2;
      
      const radialWave = Math.sin(distFromCenter * 0.08 - waveSpeed);
      const spiralWave = Math.cos(angleXZ * modes + distFromCenter * 0.03 - waveSpeed * 0.8);
      const pulsatingWave = Math.sin(waveSpeed * 0.5);
      
      const combinedWave = radialWave * spiralWave * (0.7 + pulsatingWave * 0.3);
      
      const smoothDisplacement = combinedWave * config.sensitivity * 12;
      
      const normalX = origX / (distFromCenter + 0.001);
      const normalY = origY / (distFromCenter + 0.001);
      const normalZ = origZ / (distFromCenter + 0.001);
      
      positions[i] = origX + normalX * smoothDisplacement;
      positions[i + 1] = origY + normalY * smoothDisplacement;
      positions[i + 2] = origZ + normalZ * smoothDisplacement;
      
      const normalizedWave = (combinedWave + 1) * 0.5;
      const colorPhase = normalizedWave;
      const mixedColor = new THREE.Color().lerpColors(c1, c2, colorPhase);
      const brightness = 1 - Math.min(distFromCenter / (250 * config.particleSpread), 0.6);
      
      colors[i] = mixedColor.r * config.glowIntensity * brightness;
      colors[i + 1] = mixedColor.g * config.glowIntensity * brightness;
      colors[i + 2] = mixedColor.b * config.glowIntensity * brightness;
      
      const sizeVariation = 0.8 + Math.abs(combinedWave) * 0.6;
      sizes[i / 3] = sizeVariation * brightness * (1.5 + config.glowIntensity * 0.3);
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
    particlesRef.current.geometry.attributes.color.needsUpdate = true;
    particlesRef.current.geometry.attributes.size.needsUpdate = true;
  };

  const toggleAudio = async () => {
    if (settings.audioSource === 'generator') {
      if (!oscillatorRef.current) {
        startGenerator();
      } else {
        stopAudio();
      }
    } else {
      if (!streamRef.current) {
        await startMicrophone();
      } else {
        stopAudio();
      }
    }
  };

  const startGenerator = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(settings.frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start();
    oscillatorRef.current = oscillator;
  };

  const startMicrophone = async () => {
    try {
      const constraints = {
        audio: {
          deviceId: settings.selectedMicId !== 'default' ? { exact: settings.selectedMicId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      if (settings.selectedMicId === 'system') {
        constraints.audio = {
          mandatory: {
            chromeMediaSource: 'desktop',
            echoCancellation: false
          }
        };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateFrequency = () => {
        if (!analyserRef.current || !streamRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        let maxVal = 0;
        let maxIndex = 0;
        for (let i = 0; i < dataArray.length; i++) {
          if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
          }
        }
        
        const nyquist = ctx.sampleRate / 2;
        const frequency = (maxIndex * nyquist) / analyser.frequencyBinCount;
        
        if (maxVal > 30 && frequency > 20 && frequency < 2000) {
          setSettings(prev => ({ ...prev, frequency: Math.round(frequency) }));
        }
        
        requestAnimationFrame(updateFrequency);
      };
      
      updateFrequency();
      
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Microphone access is required. Please allow microphone permission and try again. For system audio capture, this feature may not be available on all browsers/devices.');
      setSettings(prev => ({ ...prev, audioSource: 'generator' }));
    }
  };

  const stopAudio = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const updateSetting = (key, value) => {
    if (key === 'audioSource' || key === 'selectedMicId') {
      stopAudio();
      if (key === 'selectedMicId' && settings.audioSource === 'microphone') {
        setSettings(prev => ({ ...prev, [key]: value }));
        setTimeout(() => startMicrophone(), 100);
        return;
      }
    }
    
    setSettings(prev => ({ ...prev, [key]: value }));
    
    if (key === 'frequency' && oscillatorRef.current && audioContextRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(
        value, 
        audioContextRef.current.currentTime
      );
    }

    if ((key === 'color1' || key === 'color2') && orbsRef.current.length > 0) {
      const newColor = new THREE.Color(value);
      orbsRef.current.forEach((orb, index) => {
        if ((key === 'color1' && index % 2 === 0) || (key === 'color2' && index % 2 === 1)) {
          orb.material.color = newColor;
          if (orb.children[0]) {
            orb.children[0].material.color = newColor;
          }
        }
      });
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <div 
        ref={containerRef} 
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      <button
        onClick={() => setShowSettings(!showSettings)}
        className={`absolute bottom-6 right-6 z-30 bg-gradient-to-br from-pink-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 p-4 rounded-full hover:from-pink-500/30 hover:to-purple-500/30 transition-all shadow-2xl ${showSettings ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <Settings className="w-6 h-6 text-white" />
      </button>

      <div
        className={`absolute bottom-6 right-6 w-80 bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl transition-all duration-300 z-20 settings-panel ${
          showSettings ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="p-4 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
              Controls
            </h2>
            <button onClick={() => setShowSettings(false)} className="text-white/60 hover:text-white text-xl">×</button>
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">
              Particle Spread: <span className="text-white font-mono text-xs">{settings.particleSpread.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.particleSpread}
              onChange={(e) => updateSetting('particleSpread', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">Audio Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateSetting('audioSource', 'generator')}
                className={`py-2 px-3 text-sm rounded-lg transition-all flex items-center justify-center gap-2 ${
                  settings.audioSource === 'generator' 
                    ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                <Zap className="w-4 h-4" />
                Generator
              </button>
              <button
                onClick={() => updateSetting('audioSource', 'microphone')}
                className={`py-2 px-3 text-sm rounded-lg transition-all flex items-center justify-center gap-2 ${
                  settings.audioSource === 'microphone' 
                    ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                <Mic className="w-4 h-4" />
                Microphone
              </button>
            </div>
          </div>

          {settings.audioSource === 'generator' && (
            <div>
              <label className="text-white/70 text-xs block mb-2">
                Frequency: <span className="text-white font-mono">{settings.frequency} Hz</span>
              </label>
              <input
                type="range"
                min="20"
                max="2000"
                value={settings.frequency}
                onChange={(e) => updateSetting('frequency', parseInt(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
              <div className="grid grid-cols-4 gap-2 mt-3">
                <button
                  onClick={() => updateSetting('frequency', 432)}
                  className={`py-2 px-2 text-xs rounded-lg transition-all ${
                    settings.frequency === 432
                      ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  432
                </button>
                <button
                  onClick={() => updateSetting('frequency', 528)}
                  className={`py-2 px-2 text-xs rounded-lg transition-all ${
                    settings.frequency === 528
                      ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  528
                </button>
                <button
                  onClick={() => updateSetting('frequency', 639)}
                  className={`py-2 px-2 text-xs rounded-lg transition-all ${
                    settings.frequency === 639
                      ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  639
                </button>
                <button
                  onClick={() => updateSetting('frequency', 963)}
                  className={`py-2 px-2 text-xs rounded-lg transition-all ${
                    settings.frequency === 963
                      ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  963
                </button>
              </div>
            </div>
          )}

          {settings.audioSource === 'microphone' && (
            <div>
              <label className="text-white/70 text-xs block mb-2">
                Detected: <span className="text-white font-mono">{settings.frequency} Hz</span>
              </label>
              <div className="mt-2">
                <label className="text-white/70 text-xs block mb-2">Audio Input Source</label>
                <select
                  value={settings.selectedMicId}
                  onChange={(e) => updateSetting('selectedMicId', e.target.value)}
                  className="w-full bg-white/10 text-white text-sm p-2 rounded-lg border border-white/20 focus:border-pink-500/50 focus:outline-none appearance-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="default" className="bg-gray-900 text-white">Default Microphone</option>
                  {audioDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId} className="bg-gray-900 text-white">
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                  <option value="system" className="bg-gray-900 text-white">System Audio (Desktop)</option>
                </select>
                <p className="text-white/40 text-xs mt-1">
                  System audio capture may require screen sharing permission
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="text-white/70 text-xs block mb-2">Visual Style</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => updateSetting('visualStyle', 'organic')}
                className={`py-3 px-2 text-xs rounded-lg transition-all ${
                  settings.visualStyle === 'organic' 
                    ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Galaxy
              </button>
              <button
                onClick={() => updateSetting('visualStyle', 'geometric')}
                className={`py-3 px-2 text-xs rounded-lg transition-all ${
                  settings.visualStyle === 'geometric' 
                    ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Rings
              </button>
              <button
                onClick={() => updateSetting('visualStyle', 'ethereal')}
                className={`py-3 px-2 text-xs rounded-lg transition-all ${
                  settings.visualStyle === 'ethereal' 
                    ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white' 
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Sphere
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/70 text-xs">Show Floating Orbs</label>
              <button
                onClick={() => updateSetting('showOrbs', !settings.showOrbs)}
                className={`relative w-12 h-6 rounded-full transition-all ${
                  settings.showOrbs 
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500' 
                    : 'bg-white/10'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.showOrbs ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">
              Particles: <span className="text-white font-mono text-xs">{settings.particleCount.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min="20000"
              max="150000"
              step="10000"
              value={settings.particleCount}
              onChange={(e) => updateSetting('particleCount', parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-white/70 text-xs block mb-2">Color 1</label>
              <input
                type="color"
                value={settings.color1}
                onChange={(e) => updateSetting('color1', e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer bg-white/10 border border-white/20"
              />
            </div>
            <div>
              <label className="text-white/70 text-xs block mb-2">Color 2</label>
              <input
                type="color"
                value={settings.color2}
                onChange={(e) => updateSetting('color2', e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer bg-white/10 border border-white/20"
              />
            </div>
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">
              Wave Intensity: <span className="text-white font-mono text-xs">{settings.sensitivity.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={settings.sensitivity}
              onChange={(e) => updateSetting('sensitivity', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">
              Glow: <span className="text-white font-mono text-xs">{settings.glowIntensity.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.glowIntensity}
              onChange={(e) => updateSetting('glowIntensity', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs block mb-2">
              Zoom: <span className="text-white font-mono text-xs">{settings.zoom}</span>
            </label>
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={settings.zoom}
              onChange={(e) => updateSetting('zoom', parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CymaticsVisualizer;
