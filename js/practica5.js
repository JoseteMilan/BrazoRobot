/* Prácticas P2-P5: un solo grafo de escena para geometría, controles y animación. */
'use strict';

var renderer, scene, camera, cameraCenital, controls, gui;
var robot, baseGiratoria, brazo, rotula, antebrazo, mano, pinza, dedoIzquierdo, dedoDerecho;
var camaraEntorno, entornoPendiente = true, tiempoEntorno = 1;
var materialesRobot = [];
var controladores = [];
var teclas = {};
var reloj = new THREE.Clock();
var animacion = null;
var LIMITE_SUELO = 440;

var estado = {
    base: 0,
    brazo: 0,
    antebrazoY: 0,
    antebrazoZ: 0,
    pinza: 0,
    apertura: 10,
    alambrico: false,
    iniciarAnimacion: iniciarAnimacion
};

init();
loadScene();
encuadrarRobot();
setupGUI();
render();

function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('container').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x332d24);
    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 1, 1600);
    camera.position.set(285, 230, 325);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 120, 0);
    controls.enableKeys = false; // Las flechas pertenecen al robot.
    controls.maxDistance = 950;
    controls.minDistance = 100;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.update();

    // Campo más cerrado para ampliar el robot dentro del minimapa.
    cameraCenital = new THREE.OrthographicCamera(-160, 160, 160, -160, 1, 650);
    cameraCenital.position.set(0, 520, 0);
    cameraCenital.up.set(0, 0, -1);
    cameraCenital.lookAt(0, 0, 0);

    window.addEventListener('resize', updateAspectRatio);
    window.addEventListener('keydown', function (event) {
        if (!event.key.startsWith('Arrow') || esControlGUI(event.target)) return;
        event.preventDefault();
        teclas[event.key] = true;
        animacion = null;
    });
    window.addEventListener('keyup', function (event) {
        if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            teclas[event.key] = false;
        }
    });
    window.addEventListener('blur', function () { teclas = {}; });
}

function esControlGUI(elemento) {
    return elemento && (elemento.closest('.lil-gui') || /INPUT|SELECT|TEXTAREA/.test(elemento.tagName));
}

function encuadrarRobot() {
    // El encuadre se calcula con la geometría terminada, incluida la pinza.
    robot.updateWorldMatrix(true, true);
    var caja = new THREE.Box3().setFromObject(robot);
    var centro = caja.getCenter(new THREE.Vector3());
    var radio = caja.getSize(new THREE.Vector3()).length() / 2;
    var anguloVertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    var anguloHorizontal = Math.atan(Math.tan(anguloVertical) * camera.aspect);
    var distancia = radio / Math.sin(Math.min(anguloVertical, anguloHorizontal)) * 1.18;
    camera.position.copy(centro).addScaledVector(new THREE.Vector3(1.05, 0.8, 1.5).normalize(), distancia);
    controls.target.copy(centro);
    controls.update();
}

function crearTextura(tipo, tono) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = tono;
    ctx.fillRect(0, 0, 512, 512);

    // Texturas propias y locales: grano, chapa estriada y paneles de taller.
    // La semilla fija evita variaciones entre recargas.
    var semilla = 173;
    function azar() {
        semilla = (semilla * 1664525 + 1013904223) >>> 0;
        return semilla / 4294967296;
    }
    if (tipo !== 'relieve') {
        for (var n = 0; n < 14000; n++) {
            ctx.fillStyle = azar() > 0.5 ? 'rgba(255,248,231,.08)' : 'rgba(12,10,7,.10)';
            ctx.fillRect(azar() * 512, azar() * 512, tipo === 'metal' ? 8 : 2, 1);
        }
    }
    if (tipo === 'suelo' || tipo === 'relieve') {
        // Los rombos se alternan a +/-45 grados. La segunda textura es su relieve.
        for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
            ctx.save();
            ctx.translate(32 + x * 64, 32 + y * 64);
            ctx.rotate((x + y) % 2 ? Math.PI / 4 : -Math.PI / 4);
            var brillo = ctx.createLinearGradient(-5, 0, 5, 0);
            brillo.addColorStop(0, tipo === 'relieve' ? '#606060' : '#424440');
            brillo.addColorStop(0.3, tipo === 'relieve' ? '#d8d8d8' : '#d2d1c9');
            brillo.addColorStop(0.65, tipo === 'relieve' ? '#e8e8e8' : '#a9a9a1');
            brillo.addColorStop(1, tipo === 'relieve' ? '#606060' : '#4b4c47');
            ctx.fillStyle = brillo;
            ctx.beginPath();
            ctx.moveTo(0, -25); ctx.lineTo(5, -15); ctx.lineTo(5, 15);
            ctx.lineTo(0, 25); ctx.lineTo(-5, 15); ctx.lineTo(-5, -15);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    } else if (tipo === 'metal') {
        for (var i = 0; i < 512; i += 3) {
            ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(20,18,13,.05)';
            ctx.fillRect(0, i, 512, 1);
        }
    } else if (tipo === 'pared' || tipo === 'techo') {
        for (var p = 0; p < 4; p++) {
            var fila = Math.floor(p / 2), columna = p % 2;
            var px = columna * 256, py = fila * 256;
            var panel = ctx.createLinearGradient(px, py, px + 256, py + 256);
            panel.addColorStop(0, 'rgba(222,193,125,.22)');
            panel.addColorStop(0.45, 'rgba(21,17,11,.16)');
            panel.addColorStop(1, 'rgba(13,10,6,.50)');
            ctx.fillStyle = panel; ctx.fillRect(px + 12, py + 12, 232, 232);
            ctx.strokeStyle = '#332c20'; ctx.lineWidth = 8;
            ctx.strokeRect(px + 7, py + 7, 242, 242);
            ctx.strokeStyle = 'rgba(177,151,102,.55)'; ctx.lineWidth = 2;
            ctx.strokeRect(px + 15, py + 15, 225, 225);
            [26, 230].forEach(function (rx) {
                [26, 230].forEach(function (ry) {
                    ctx.fillStyle = '#2c261d';
                    ctx.beginPath(); ctx.arc(px + rx, py + ry, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#b1a07d';
                    ctx.beginPath(); ctx.arc(px + rx - 1, py + ry - 1, 2, 0, Math.PI * 2); ctx.fill();
                });
            });
            // Bandas y refuerzos metálicos, con desgaste vertical discreto.
            for (var r = 0; r < 5; r++) {
                ctx.fillStyle = 'rgba(24,20,13,.25)';
                ctx.fillRect(px + 24, py + 69 + r * 25, 208, 3);
                ctx.fillStyle = 'rgba(213,184,128,.18)';
                ctx.fillRect(px + 24, py + 66 + r * 25, 208, 2);
            }
        }
    }
    var textura = new THREE.CanvasTexture(canvas);
    textura.encoding = THREE.sRGBEncoding;
    textura.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return textura;
}

function materialMate(color, textura) {
    var material = new THREE.MeshLambertMaterial({ color: color, map: textura });
    materialesRobot.push(material);
    return material;
}

function materialBrillante(color, textura, brillo) {
    var material = new THREE.MeshPhongMaterial({ color: color, map: textura, shininess: brillo });
    materialesRobot.push(material);
    return material;
}

function mapasMetalFotografico(repeticionX, repeticionY) {
    // Fotografía local de acero cepillado; el relieve conserva datos lineales.
    var relieve = new THREE.Texture();
    var color = new THREE.TextureLoader().load('images/metal_128.jpg', function (textura) {
        relieve.image = textura.image;
        relieve.needsUpdate = true;
    });
    color.encoding = THREE.sRGBEncoding;
    [color, relieve].forEach(function (textura) {
        textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
        textura.repeat.set(repeticionX, repeticionY);
        textura.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    });
    return { color: color, relieve: relieve };
}

function mapasMetalMecanizado(tipo) {
    // Mapas distintos para fundición, cepillado longitudinal y marcas de torno.
    var lienzoColor = document.createElement('canvas');
    var lienzoRelieve = document.createElement('canvas');
    lienzoColor.width = lienzoColor.height = lienzoRelieve.width = lienzoRelieve.height = 512;
    var contextoColor = lienzoColor.getContext('2d');
    var contextoRelieve = lienzoRelieve.getContext('2d');
    var datosColor = contextoColor.createImageData(512, 512);
    var datosRelieve = contextoRelieve.createImageData(512, 512);
    var semilla = 3917;
    for (var y = 0; y < 512; y++) for (var x = 0; x < 512; x++) {
        semilla = (semilla * 1664525 + 1013904223) >>> 0;
        var ruido = semilla / 4294967296 - 0.5;
        var marca;
        if (tipo === 'torneado') {
            marca = Math.sin(Math.hypot(x - 255.5, y - 255.5) * Math.PI / 2);
        } else if (tipo === 'anillos') {
            marca = Math.sin(y * Math.PI / 2);
        } else if (tipo === 'cepillado') {
            marca = 0.7 * Math.sin(x * 1.37) + 0.3 * Math.sin(x * 0.31);
        } else {
            marca = ruido * 2; // Grano de fundición, sin estrías periódicas.
        }
        var indice = (y * 512 + x) * 4;
        var tono = Math.round(222 + marca * 9 + ruido * 8);
        var altura = Math.round(128 + marca * 24 + ruido * 10);
        for (var canal = 0; canal < 3; canal++) {
            datosColor.data[indice + canal] = tono;
            datosRelieve.data[indice + canal] = altura;
        }
        datosColor.data[indice + 3] = datosRelieve.data[indice + 3] = 255;
    }
    contextoColor.putImageData(datosColor, 0, 0);
    contextoRelieve.putImageData(datosRelieve, 0, 0);
    var color = new THREE.CanvasTexture(lienzoColor);
    var relieve = new THREE.CanvasTexture(lienzoRelieve);
    color.encoding = THREE.sRGBEncoding;
    [color, relieve].forEach(function (textura) {
        textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
        textura.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    });
    return { color: color, relieve: relieve };
}

function pieza(geometria, material, padre, x, y, z, nombre) {
    var malla = new THREE.Mesh(geometria, material);
    malla.name = nombre || '';
    malla.position.set(x, y, z);
    malla.castShadow = true;
    malla.receiveShadow = true;
    padre.add(malla);
    return malla;
}

function crearHabitacion() {
    // Orden de los seis grupos de BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
    var nombresCaras = ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'];
    var cargador = new THREE.TextureLoader();
    var materiales = nombresCaras.map(function (nombre) {
        var ruta = 'images/' + nombre + '.jpg';
        var textura = cargador.load(ruta, function () {
            // La carga es asíncrona: actualizar también el reflejo aunque el robot esté quieto.
            entornoPendiente = true;
        }, undefined, function () {
            console.error('No se ha podido cargar la cara de la habitación: ' + ruta);
        });
        textura.encoding = THREE.sRGBEncoding;
        textura.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        // Las fotos contienen su iluminación; BackSide permite verlas desde dentro.
        return new THREE.MeshBasicMaterial({ map: textura, side: THREE.BackSide });
    });
    var habitacion = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), materiales);
    habitacion.name = 'Habitación / cubo con seis fotografías';
    habitacion.position.y = 499; // Fondo del cubo bajo el suelo, sin caras coplanares.
    scene.add(habitacion);

    var texturaSuelo = crearTextura('suelo', '#797b76');
    var relieveSuelo = crearTextura('relieve', '#606060');
    relieveSuelo.encoding = THREE.LinearEncoding;
    [texturaSuelo, relieveSuelo].forEach(function (textura) {
        textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
        textura.repeat.set(10, 10);
    });
    var suelo = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.MeshPhongMaterial({
            map: texturaSuelo, bumpMap: relieveSuelo, bumpScale: 0.7,
            shininess: 32, specular: 0x4a4942, side: THREE.DoubleSide
        })
    );
    suelo.name = 'Suelo de chapa 1000 x 1000';
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.y = 0;
    suelo.receiveShadow = true;
    scene.add(suelo);
    // Capturamos la habitación real desde la rótula: suelo, paredes y luz coinciden
    // con lo reflejado, sin inversiones de las caras de un cubemap pintado a mano.
    var mapaEntorno = new THREE.WebGLCubeRenderTarget(512, {
        generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
        encoding: THREE.sRGBEncoding
    });
    camaraEntorno = new THREE.CubeCamera(1, 1800, mapaEntorno);
    return mapaEntorno.texture;
}

function crearDedo(materialUnion, materialPunta) {
    // P2, figura 4: longitud TOTAL 38 = bloque de 19 + cuña de 19.
    // Altura 20 -> 10: tanto la arista superior como la inferior forman un bisel.
    // El grosor disminuye de 4 a 2 en la punta.
    // La cara interior Z=0 permanece plana para que los dos dedos puedan cerrar.
    var puntos = [
        [19,-10,0], [38,-5,0], [38,5,0], [19,10,0],
        [19,-10,4], [38,-5,2], [38,5,2], [19,10,4]
    ].map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    var caras = [[0,3,2,1], [4,5,6,7], [0,1,5,4], [3,7,6,2], [0,4,7,3], [1,2,6,5]];
    var vertices = [], uvs = [], indices = [];
    caras.forEach(function (cara) {
        var origen = puntos[cara[0]];
        var ejeU = puntos[cara[1]].clone().sub(origen).normalize();
        var normal = ejeU.clone().cross(puntos[cara[3]].clone().sub(origen)).normalize();
        var ejeV = normal.clone().cross(ejeU);
        var inicio = vertices.length / 3;
        cara.forEach(function (indice) {
            var punto = puntos[indice], local = punto.clone().sub(origen);
            vertices.push(punto.x, punto.y, punto.z);
            uvs.push(local.dot(ejeU) / 20, local.dot(ejeV) / 20);
        });
        indices.push(inicio, inicio+1, inicio+2, inicio, inicio+2, inicio+3);
    });
    var geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometria.setIndex(indices);
    // Vértices separados entre caras: aristas nítidas y normales planas correctas.
    geometria.computeVertexNormals();

    var dedo = new THREE.Group();
    pieza(new THREE.BoxGeometry(19, 20, 4), materialUnion, dedo, 9.5, 0, 2, 'Unión del dedo 19 x 20 x 4');
    pieza(geometria, materialPunta, dedo, 0, 0, 0, 'Cuña del dedo');
    return dedo;
}

function crearRobot(mapaEntorno) {
    function acabado(color, mapas, brillo, reflejo, relieve) {
        var material = materialBrillante(color, mapas.color, brillo);
        material.bumpMap = mapas.relieve;
        material.bumpScale = relieve;
        material.specular.setHex(0xc1c6cb);
        material.envMap = mapaEntorno;
        material.combine = THREE.MixOperation;
        material.reflectivity = reflejo;
        return material;
    }
    var fundicion = mapasMetalMecanizado('fundicion');
    var radial = mapasMetalMecanizado('torneado');
    var anillos = mapasMetalMecanizado('anillos');
    var longitudinal = mapasMetalMecanizado('cepillado');
    // Base, eje y pie comparten el mismo acero gris oscuro.
    var aceroBase = acabado(0x252b31, fundicion, 45, 0.08, 0.04);      
    var aceroEje = acabado(0x78838c, radial, 105, 0.18, 0.015);      
    var aceroPie = acabado(0x46515b, longitudinal, 70, 0.10, 0.025); 
    var aceroPie = acabado(0x454d56, mapasMetalFotografico(1, 1), 115, 0.20, 0.025);
    var oroSuperior = 0x896018;
    var nerviosDorados = acabado(oroSuperior, longitudinal, 115, 0.22, 0.025);
    nerviosDorados.specular.setHex(0xe8cda0);
    var bronceDisco = acabado(0xb58c4d, radial, 95, 0.22, 0.045);
    bronceDisco.specular.setHex(0xe8cda0);
    var bordeDisco = acabado(0x896018, anillos, 70, 0.15, 0.035);
    var oroCilindro = 0x896018;
    var oroMano = acabado(oroCilindro, anillos, 115, 0.14, 0.035);
    oroMano.specular.setHex(0xc69b46);
    var tapasMano = acabado(oroCilindro, radial, 115, 0.14, 0.025);
    tapasMano.specular.setHex(0xc69b46);
    var unionPinza = acabado(0x101319, fundicion, 65, 0.07, 0.045);
    var aceroPinza = acabado(0x161b22, mapasMetalFotografico(1, 1), 120, 0.10, 0.018);
    var materialRotula = new THREE.MeshPhongMaterial({
        // Oro oscuro con reflejo moderado para que el suelo no domine la esfera.
        color: 0x1c1307, envMap: mapaEntorno, combine: THREE.MixOperation,
        reflectivity: 0.30, shininess: 180, specular: 0x000000
    });
    materialesRobot.push(materialRotula);

    robot = new THREE.Group();
    robot.name = 'Robot / desplazamiento sobre XZ';
    scene.add(robot);
    baseGiratoria = new THREE.Group();
    baseGiratoria.name = 'Base / giro Y';
    robot.add(baseGiratoria);
    pieza(new THREE.CylinderGeometry(50, 50, 15, 64), aceroBase, baseGiratoria, 0, 7.5, 0, 'Base r50 h15');

    // El pivote del brazo coincide con el eje transversal, no con el centro del espárrago.
    brazo = new THREE.Group();
    brazo.name = 'Brazo / eje Z';
    brazo.position.y = 22;
    baseGiratoria.add(brazo);
    var eje = pieza(new THREE.CylinderGeometry(20, 20, 18, 48), aceroEje, brazo, 0, 0, 0, 'Eje transversal r20 h18');
    eje.rotation.x = Math.PI / 2;
    pieza(new THREE.BoxGeometry(18, 120, 12), aceroPie, brazo, 0, 60, 0, 'Espárrago 18 x 120 x 12');
    rotula = pieza(new THREE.SphereGeometry(20, 48, 32), materialRotula, brazo, 0, 120, 0, 'Rótula r20');

    // Los dos giros del antebrazo parten del centro de la rótula.
    antebrazo = new THREE.Group();
    antebrazo.name = 'Antebrazo / rótula Y y Z';
    antebrazo.position.y = 120;
    antebrazo.rotation.order = 'YZX';
    brazo.add(antebrazo);
    // El origen del disco coincide con la rótula; la distancia a la mano es 80.
    pieza(new THREE.CylinderGeometry(22, 22, 6, 48), [bordeDisco, bronceDisco, bronceDisco], antebrazo, 0, 0, 0, 'Disco r22 h6');
    [-8, 8].forEach(function (x) {
        [-10, 10].forEach(function (z) {
            pieza(new THREE.BoxGeometry(4, 80, 4), nerviosDorados, antebrazo, x, 40, z, 'Nervio 4 x 80 x 4');
        });
    });
    mano = new THREE.Group();
    mano.name = 'Mano / cilindro transversal Z';
    mano.position.y = 80;
    antebrazo.add(mano);
    var cilindroMano = pieza(new THREE.CylinderGeometry(15, 15, 40, 48), [oroMano, tapasMano, tapasMano], mano, 0, 0, 0, 'Mano r15 h40');
    cilindroMano.rotation.x = Math.PI / 2;

    // El pivote de giro de la pinza está en el eje Z de la mano.
    pinza = new THREE.Group();
    pinza.name = 'Pinza / giro Z';
    mano.add(pinza);
    dedoDerecho = crearDedo(unionPinza, aceroPinza);
    dedoIzquierdo = dedoDerecho.clone();
    dedoIzquierdo.scale.z = -1;
    dedoIzquierdo.name = 'Dedo izquierdo';
    dedoDerecho.name = 'Dedo derecho';
    // El bloque entra en la superficie del cilindro; los dedos salen radialmente.
    dedoIzquierdo.position.x = dedoDerecho.position.x = 8;
    pinza.add(dedoIzquierdo, dedoDerecho);
    aplicarEstado();
}

function crearLuces() {
    scene.add(new THREE.AmbientLight(0xfff5e3, 0.22));
    var sol = new THREE.DirectionalLight(0xfff3de, 0.78);
    sol.position.set(-220, 340, 180);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -450;
    sol.shadow.camera.right = 450;
    sol.shadow.camera.top = 450;
    sol.shadow.camera.bottom = -450;
    sol.shadow.camera.near = 1;
    sol.shadow.camera.far = 900;
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.2;
    scene.add(sol, sol.target);

    var foco = new THREE.SpotLight(0xffe8c2, 0.55, 1100, Math.PI / 4, 0.3, 1);
    foco.position.set(240, 420, -170);
    foco.target.position.set(0, 50, 0);
    foco.castShadow = true;
    foco.shadow.mapSize.set(2048, 2048);
    foco.shadow.camera.near = 5;
    foco.shadow.camera.far = 800;
    foco.shadow.bias = -0.0005;
    foco.shadow.normalBias = 0.15;
    scene.add(foco, foco.target);
}

function loadScene() {
    var mapaEntorno = crearHabitacion();
    crearRobot(mapaEntorno);
    crearLuces();
}

function aplicarEstado() {
    baseGiratoria.rotation.y = THREE.MathUtils.degToRad(estado.base);
    brazo.rotation.z = THREE.MathUtils.degToRad(estado.brazo);
    antebrazo.rotation.y = THREE.MathUtils.degToRad(estado.antebrazoY);
    antebrazo.rotation.z = THREE.MathUtils.degToRad(estado.antebrazoZ);
    pinza.rotation.z = THREE.MathUtils.degToRad(estado.pinza);
    // Apertura simétrica a lo largo del eje Z de la mano: 0 = caras interiores juntas.
    dedoIzquierdo.position.z = -estado.apertura;
    dedoDerecho.position.z = estado.apertura;
    entornoPendiente = true;
}

function setupGUI() {
    gui = new lil.GUI({ title: 'Robot articulado' });
    function control(campo, min, max, nombre) {
        var controlador = gui.add(estado, campo, min, max, 1).name(nombre);
        controlador.onChange(function () { animacion = null; aplicarEstado(); });
        controladores.push(controlador);
    }
    control('base', -180, 180, 'Giro Base');
    control('brazo', -45, 45, 'Giro Brazo');
    control('antebrazoY', -180, 180, 'Giro Antebrazo Y');
    control('antebrazoZ', -90, 90, 'Giro Antebrazo Z');
    control('pinza', -40, 220, 'Giro Pinza');
    control('apertura', 0, 15, 'Separación Pinza');
    gui.add(estado, 'alambrico').name('Alambres').onChange(function (valor) {
        materialesRobot.forEach(function (material) { material.wireframe = valor; });
    });
    gui.add(estado, 'iniciarAnimacion').name('Iniciar animación');
}

function iniciarAnimacion() {
    // Referencia: secuencia automática de 15 s; la base no se traslada por el suelo.
    var neutra = { base: 0, brazo: 0, antebrazoY: 0, antebrazoZ: 0, pinza: 0, apertura: 10 };
    var origen = {};
    var necesitaPreparacion = false;
    Object.keys(neutra).forEach(function (clave) {
        origen[clave] = estado[clave];
        if (Math.abs(origen[clave] - neutra[clave]) > 0.001) necesitaPreparacion = true;
    });
    // Una nueva pulsación sustituye la secuencia anterior desde la postura actual.
    teclas = {};
    animacion = {
        inicio: performance.now(),
        duracion: 15,
        preparacion: necesitaPreparacion ? 0.6 : 0,
        origen: origen,
        neutra: neutra,
        // Puntos de control Bézier, no posturas intermedias que deban alcanzarse.
        // Reproducen los valores del vídeo, incluidos los extremos de +/-69.28° de la base.
        giros: {
            base: [0, -180, 0, 180, 0],
            brazo: [0, -45, 0, 45, 0],
            antebrazoY: [0, -180, 0, 180, 0],
            antebrazoZ: [0, -90, 0, 90, 0],
            pinza: [0, -40, 0, 220, 0]
        },
        aperturas: [10, 15, 0, 15, 0, 10]
    };
}

function actualizarAnimacion() {
    if (!animacion) return;
    // Tiempo real: los 15 s se mantienen incluso si disminuyen los FPS.
    var transcurrido = (performance.now() - animacion.inicio) / 1000;
    var terminada = transcurrido >= animacion.preparacion + animacion.duracion;
    if (transcurrido < animacion.preparacion) {
        var entrada = transcurrido / animacion.preparacion;
        entrada = entrada * entrada * (3 - 2 * entrada);
        Object.keys(animacion.neutra).forEach(function (clave) {
            estado[clave] = THREE.MathUtils.lerp(animacion.origen[clave], animacion.neutra[clave], entrada);
        });
    } else {
        var t = THREE.MathUtils.clamp((transcurrido - animacion.preparacion) / animacion.duracion, 0, 1);
        var u = 1 - t;
        var pesos = [u*u*u*u, 4*u*u*u*t, 6*u*u*t*t, 4*u*t*t*t, t*t*t*t];
        Object.keys(animacion.giros).forEach(function (clave) {
            estado[clave] = animacion.giros[clave].reduce(function (valor, punto, indice) {
                return valor + punto * pesos[indice];
            }, 0);
        });
        // Apertura lineal, con cambios de sentido cada 3 s, como en los sliders del vídeo.
        var tramo = t * (animacion.aperturas.length - 1);
        var indice = Math.min(Math.floor(tramo), animacion.aperturas.length - 2);
        estado.apertura = THREE.MathUtils.lerp(animacion.aperturas[indice], animacion.aperturas[indice + 1], tramo - indice);
    }
    aplicarEstado();
    controladores.forEach(function (controlador) { controlador.updateDisplay(); });
    if (terminada) animacion = null;
}

function update(delta) {
    actualizarAnimacion();
    var x = (teclas.ArrowRight ? 1 : 0) - (teclas.ArrowLeft ? 1 : 0);
    var z = (teclas.ArrowDown ? 1 : 0) - (teclas.ArrowUp ? 1 : 0);
    if (x || z) {
        var longitud = Math.hypot(x, z);
        robot.position.x = THREE.MathUtils.clamp(robot.position.x + 95 * delta * x / longitud, -LIMITE_SUELO, LIMITE_SUELO);
        robot.position.z = THREE.MathUtils.clamp(robot.position.z + 95 * delta * z / longitud, -LIMITE_SUELO, LIMITE_SUELO);
        entornoPendiente = true;
    }
    cameraCenital.position.set(robot.position.x, 520, robot.position.z);
    cameraCenital.lookAt(robot.position.x, 0, robot.position.z);
    tiempoEntorno += delta;
    controls.update();
}

function actualizarEntorno() {
    if (!entornoPendiente || tiempoEntorno < 0.15) return;
    scene.updateMatrixWorld(true);
    rotula.getWorldPosition(camaraEntorno.position);
    var actualizarSombras = renderer.shadowMap.autoUpdate;
    // No capturar la propia esfera ni volver a dibujar seis veces sus sombras.
    robot.visible = false;
    renderer.shadowMap.autoUpdate = false;
    try {
        camaraEntorno.update(renderer, scene);
    } finally {
        robot.visible = true;
        renderer.shadowMap.autoUpdate = actualizarSombras;
    }
    entornoPendiente = false;
    tiempoEntorno = 0;
}

function updateAspectRatio() {
    var ancho = window.innerWidth, alto = window.innerHeight;
    renderer.setSize(ancho, alto);
    camera.aspect = ancho / alto;
    camera.updateProjectionMatrix();
    // La vista ortográfica mantiene su campo cuadrado; su viewport se recalcula al renderizar.
    cameraCenital.updateProjectionMatrix();
}

function render() {
    requestAnimationFrame(render);
    update(Math.min(reloj.getDelta(), 0.05));
    actualizarEntorno();
    var ancho = window.innerWidth, alto = window.innerHeight;
    var lado = Math.max(1, Math.floor(Math.min(ancho, alto) / 4));
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, ancho, alto);
    renderer.setScissor(0, 0, ancho, alto);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    renderer.setViewport(0, alto - lado, lado, lado);
    renderer.setScissor(0, alto - lado, lado, lado);
    renderer.clear(true, true, true);
    renderer.render(scene, cameraCenital);
    renderer.setScissorTest(false);
}
