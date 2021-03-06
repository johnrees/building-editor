import React, { Component } from 'react'
import * as THREE from 'three'
import key from 'keymaster'
var OrbitControls = require('three-orbit-controls')(THREE)
import Shape from 'clipper-js'
import {Clipper} from 'clipsy'
import { GUI } from 'dat-gui'
import _ from 'lodash'
import store from 'store'
import 'whatwg-fetch'

const rev = (mm) => (mm*25.0)
const normalize = (mm) => (mm/25.0)
const mm = normalize

const EDGES_COLOR = 0xbbbbbb;

const ballGeometry = new THREE.SphereGeometry(mm(120), 32, 32);
const ballMaterial = new THREE.MeshBasicMaterial({color: 0x000000});

const plywoodMaterial = new THREE.MeshPhongMaterial({color: 0xD5D3BC, shininess: 0 });
const barMaterial = new THREE.MeshPhongMaterial({color: 0xB4B4B2, shininess: 0});
const insulationMaterial = new THREE.MeshPhongMaterial({color: 0xDAA39A });

const projectID = parseInt(window.location.hash.replace(/\D/g,""))
const projectLocked = window.location.hash.match("locked")
let storeKey = `${projectID}-`

let updateTime = Date.now()

let spec = store.get(storeKey +'specs') || {
  showEdges: true,
  width: 3900,
  frames: 7,
  visible: {
    shadows: false,
    edges: true,
    topbar: true,
    roof: true,
    ceiling: true,
    outerWall: true,
    innerWall: true,
    frontWall: true,
    backWall: true,
    insulation: false,
    bar: true,
    floor: true,
    jackpads: true
  },
  ply: {
    depth: 18
  },
  roof: {
    apex: 3800
  },
  leftWall: {
    height: 2400
  },
  rightWall: {
    height: 2400
  },
  beams: {
    width: 74,
    height: 200,
  },
  totals: {
  }
}
let previousSpec, newSpec;

const showAxes = (object, length=30) => {
  drawArrow([1,0,0], 0XFF0000, object, length)
  drawArrow([0,1,0], 0X00FF00, object, length)
  drawArrow([0,0,1], 0X0000FF, object, length)
}

const drawArrow = (direction, color, parent, length) => {
  const dir = new THREE.Vector3( ...direction );
  dir.normalize();
  const origin = new THREE.Vector3();
  var arrowHelper = new THREE.ArrowHelper( dir, origin, length, color );
  parent.add(arrowHelper)
}

const setVal = (id, val, format=true) => {
  val = (format ? val.toFixed(2) : val)
  document.getElementById(id).innerHTML = val
}

class App extends Component {

  constructor(props) {
    super(props)
    this.camera = undefined;
    this.renderer = undefined;
    this.mouse = new THREE.Vector2()
    this.plane = new THREE.Plane()
    this.intersection = new THREE.Vector3()
    this.offset = null
    this.raycaster = new THREE.Raycaster()
    this.selectedBall = null;
    this.balls = []
    this.roofPanels = []
    this.mouseDown = false
    this.microhouseHolder = new THREE.Object3D()

    this.onWindowResize = this.onWindowResize.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseWheel = this.onMouseWheel.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.wikihouse = this.wikihouse.bind(this)
    this.animate = this.animate.bind(this)
    this.updateWikiHouse = this.updateWikiHouse.bind(this)
    this.renderWikiHouse = _.debounce(this.renderWikiHouse.bind(this), 5)
    this.saveCosts = _.debounce(this.saveCosts.bind(this), 1000)
    // this.renderWikiHouse = this.renderWikiHouse.bind(this)
  }

  saveCosts() {
    const {plywoodSheets, insulationVolume} = spec
    if (projectID) {
      fetch(`${process.env.REACT_APP_BUILDX_URL}/p/${projectID}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({project: { cost_data: { plywoodSheets, insulationVolume } }})
      })
    }
  }

  componentDidMount() {
    const VIEW_ANGLE = 70;
    const ASPECT =  window.innerWidth / window.innerHeight;
    const NEAR = 0.1;
    const FAR = 10000;

    // SET UP RENDERER
    const container = document.querySelector('#container');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio( window.devicePixelRatio );

    this.renderer.shadowMap.type = THREE.BasicShadowMap; // THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();

    // SET UP CAMERA
    this.camera = new THREE.PerspectiveCamera( VIEW_ANGLE, ASPECT, NEAR, FAR )

    if (store.get(storeKey + 'mh')) {
      this.microhouseHolder.position.copy(store.get(storeKey+'mh').position);
      this.microhouseHolder.rotation.copy(store.get(storeKey+'mh').rotation);
    } else {
      this.microhouseHolder.rotation.y = -30 * Math.PI/180;
    }

    if (store.get(storeKey +'camera')) {
      this.camera.position.copy(store.get(storeKey+'camera').position);
      this.camera.rotation.copy(store.get(storeKey+'camera').rotation);
      // this.camera.lookAt(store.get(storeKey+'camera').lookAt);
    } else {
      this.camera.position.y = 280;
      this.camera.position.x = 0;//-150;
      this.camera.position.z = -250;
    }
    // this.camera.lookAt(new THREE.Vector3(0,mm(1500),0));
    this.camera.lookAt(new THREE.Vector3(this.microhouseHolder.x,mm(1500),this.microhouseHolder.z));

    // this.microhouseHolder.add(this.camera);

    // SET UP CAMERA CONTROLS
    this.controls = new OrbitControls(this.camera)
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.maxDistance = mm(30000);
    this.controls.minDistance = mm(1000);
    this.controls.enableZoom = true;
    this.scene.background = new THREE.Color(0xF6F6F6);

    //  ADD LIGHTING
    const ambientLight = new THREE.AmbientLight(0xF6F6F6)
    ambientLight.intensity = 0.3;
    this.scene.add(ambientLight);

    const mainLight = new THREE.HemisphereLight(0xFFFFFF, 0xEBEBD8, 0.7);
    this.scene.add(mainLight);

    const pointLight = new THREE.PointLight(0xCFCCB4, 0.4, 0, 1);
    // if (spec.visible.shadows) {
      pointLight.castShadow = true;
      pointLight.shadow.mapSize.width = 1024;
      pointLight.shadow.mapSize.height = 1024;
      pointLight.shadow.bias = 1;
    // }

    pointLight.position.x = 90;
    pointLight.position.y = 500;
    pointLight.position.z = -300;
    this.scene.add(pointLight);
    // const pointLightHelper = new THREE.PointLightHelper(pointLight, 50);
    // this.scene.add(pointLightHelper);

    // ADD GROUND
    if (spec.visible.shadows) {
      const groundMaterial = new THREE.ShadowMaterial();
      groundMaterial.opacity = 0.2
      const groundGeometry = new THREE.PlaneGeometry(800,800);
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.receiveShadow = true;
      ground.position.y = -mm(200-36);
      ground.rotation.x = -Math.PI/2;
      this.scene.add(ground);
    }

    // const gridMaterial = new THREE.MeshLambertMaterial({ color: 0xEEEEEE, wireframe: true });
    // const gridGeometry = new THREE.PlaneGeometry(1600,1600,30,30);
    // let grid = new THREE.Mesh(gridGeometry, gridMaterial);
    // grid.receiveShadow = false;
    // grid.position.y = ground.position.y-1;
    // grid.rotation.x = -Math.PI/2;
    // scene.add(grid);

    if (projectID > 0) {
      fetch(`${process.env.REACT_APP_BUILDX_URL}/p/${projectID}.json`)
        .then((response) => (response.json()))
        .then((json) => {

          const { mpp } = json.merged_state.building
          const coords = json.merged_state.building.site.bounds.cartesian.map(c => [mm(c[0] * mpp * 1000), mm(c[1] * mpp * 1000)])
          // const mpp = 0.09285155815616795
          // let coords = [[200,9],[218,193],[0,211],[6,239],[435,211],[431,0]].map(c => [mm(c[0] * mpp * 1000), mm(c[1] * mpp * 1000)])

          var sGeom = new THREE.Geometry()
          const centerX = Math.max(...coords.map(c => c[0]))/2
          const centerY = Math.max(...coords.map(c => c[1]))/2
          sGeom.vertices = [...coords, coords[0]].map(p => new THREE.Vector3( p[0] - centerX, p[1] - centerY, 0))
          var sMaterial = new THREE.LineBasicMaterial({color: 0xCCCCCC, linewidth: 1})
          var sLine = new THREE.Line(sGeom, sMaterial)
          sLine.rotation.x = -Math.PI/2
          sLine.rotation.y = -Math.PI
          this.scene.add(sLine)

        }).catch(function(ex) {
          console.log('parsing failed', ex)
        })
    }

    this.scene.add(this.microhouseHolder)
    this.onWindowResize()

    // SET UP DEBUG MENU
    let gui = new GUI()

    if (!projectLocked) {
      gui.add(spec, 'width', 3100, 4900).step(100).listen().onChange(this.updateWikiHouse)
      gui.add(spec.roof, 'apex', 2800, 4600).step(100).listen().onChange(this.updateWikiHouse)
      gui.add(spec, 'frames', 4, 11).step(1).listen().onChange(this.updateWikiHouse)
    }
    gui.add(spec, 'showEdges').onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'shadows').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'roof').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'insulation').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'ceiling').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'outerWall').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'innerWall').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'frontWall').listen().onChange(this.updateWikiHouse)
    gui.add(spec.visible, 'backWall').listen().onChange(this.updateWikiHouse)

    // ADD BALLS!
    const heightBall = new THREE.Mesh(ballGeometry, ballMaterial)
    heightBall.name = 'y'
    drawArrow([0,1,0], 0X00FF00, heightBall, 40)
    //
    const lengthBall = new THREE.Mesh(ballGeometry, ballMaterial)
    lengthBall.name = 'z'
    drawArrow([0,0,-1], 0X0000FF, lengthBall, 40)
    //
    const widthBall = new THREE.Mesh(ballGeometry, ballMaterial)
    widthBall.name = 'x'
    drawArrow([-1,0,0], 0XFF0000, widthBall, 40)


    if (!projectLocked) {
      this.microhouseHolder.add(heightBall)
      this.microhouseHolder.add(lengthBall)
      this.microhouseHolder.add(widthBall)
    }
    this.balls = [heightBall, lengthBall, widthBall]

    this.updateWikiHouse()

    // SET UP EVENT LISTENERS
    window.addEventListener( 'resize', this.onWindowResize, false )
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove, false )
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown, false )
    this.renderer.domElement.addEventListener('mouseup', this.onMouseUp, false )
    this.renderer.domElement.addEventListener('mousewheel', this.onMouseWheel, false )
    // this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick.bind(this), false )
    document.querySelector('.ac').addEventListener('mousedown', this.controlsMouseDown.bind(this), false)

    // temp fix to show balls
    setTimeout(this.updateWikiHouse, 20)
    setInterval(this.autosave.bind(this), 1000)

    updateTime = Date.now()
    this.animate()
  }

  autosave() {
    // console.log('autosave')
    store.set(storeKey +'specs', spec)
    store.set(storeKey +'mh', { position: this.microhouseHolder.position, rotation: this.microhouseHolder.rotation })
    store.set(storeKey +'camera', { position: this.camera.position, rotation: this.camera.rotation, lookAt: this.controls.target })
    // console.log( store.get('microhouseHolder') )
  }

  renderWikiHouse() {
    newSpec = JSON.stringify(spec)
    if (previousSpec !== newSpec) {
      previousSpec = newSpec
      if (window.microhouse) { this.microhouseHolder.remove(window.microhouse) }
      window.microhouse = this.wikihouse()
      window.microhouse.position.z -= mm(spec.length/2);
      this.microhouseHolder.add(window.microhouse)
      this.saveCosts()
      // window.microhouse.translateZ(-spec.length/2)
    }
    // requestAnimationFrame(this.animate)
    updateTime = Date.now()
  }

  updateWikiHouse(e=null) {
    const x = -mm(spec.length/2)
    this.balls[0].position.y = mm(spec.roof.apex)
    this.balls[0].position.z = x + mm(75) // 600
    this.balls[1].position.y = mm(120)
    this.balls[1].position.z = x
    this.balls[2].position.x = -mm(spec.width/2)
    this.balls[2].position.y = mm(spec.leftWall.height/2)
    this.balls[2].position.z = x + mm(75) // 600
    this.renderWikiHouse()
  }

  animate() {

    if (Date.now() - updateTime < 2000) {
      this.renderer.render(this.scene, this.camera)
    }

    // // if (!projectLocked) {
    // //   if (key.isPressed("w")) { this.microhouseHolder.translateZ(mm(50)); }
    // //   else if (key.isPressed("s")) { this.microhouseHolder.translateZ(-mm(50)); }
    // //   if (key.shift) {
    // //     if (key.isPressed("d")) { this.microhouseHolder.rotation.y += 0.01; }
    // //     else if (key.isPressed("a")) { this.microhouseHolder.rotation.y -= 0.01; }
    // //   } else {
    // //     if (key.isPressed("d")) { this.microhouseHolder.translateX(-mm(50)); }
    // //     else if (key.isPressed("a")) { this.microhouseHolder.translateX(mm(50)); }
    // //   }
    // // }

    setTimeout(function() {
      requestAnimationFrame(this.animate)
    }.bind(this), 5)

    // // if (this.mouseDown) {
    // //   // setTimeout(function() {
    // //   // this.controls.update()
    // //   // }.bind(this), 1000/30 );
    // //   this.renderer.render(this.scene, this.camera)
    // // }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth/window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    // this.animate();
    updateTime = Date.now()
  }

  onMouseMove(event) {
    this.controls.enabled = true

    this.mouse.x = (event.clientX/window.innerWidth)*2 - 1
    this.mouse.y = -(event.clientY/window.innerHeight)*2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)

    // var arrowHelper = new THREE.ArrowHelper( this.raycaster.ray.direction, this.raycaster.ray.origin, 100, 0xFF0000 );
    // this.scene.add( arrowHelper );

    let intersects = this.raycaster.intersectObjects(this.balls)

    if (this.mouseDown) {
      // requestAnimationFrame(this.animate)
      updateTime = Date.now()
    } else {
      if (intersects.length > 0) {
        this.selectedBall = intersects[0].object
      } else {
        this.selectedBall = null
      }
    }

    if (this.selectedBall) {

      if (this.mouseDown) {
        this.renderer.domElement.style.cursor = '-webkit-grabbing'
        this.controls.enabled = false
        this.plane.setFromNormalAndCoplanarPoint(
          this.camera.getWorldDirection(this.plane.normal),
          this.selectedBall.position)

        if (this.raycaster.ray.intersectPlane(this.plane, this.intersection)) {


          this.offset = this.offset || new THREE.Vector3().copy(this.intersection).sub(this.selectedBall.position)
          // this.intersection[this.selectedBall.name] = Math.abs(this.intersection[this.selectedBall.name])
          // console.log(this.microhouseHolder.rotation)
          this.selectedBall.position[this.selectedBall.name] = this.intersection[this.selectedBall.name] - this.offset[this.selectedBall.name]//this.intersection.sub(this.offset)[this.selectedBall.name]

          // this.selectedBall.position[this.selectedBall.name] = this.selectedBall.originalPosition[this.selectedBall.name] + this.intersection[this.selectedBall.name]
          // this.selectedBall.position[this.selectedBall.name] = this.intersection[this.selectedBall.name]

          switch(this.selectedBall.name) {
            case "x":
              spec.width = Math.abs(Math.round(Math.max(Math.min(-(this.selectedBall.position.x * 25.0) * 2, 4900), 3100) / 100) * 100)
              break;
            case "y":
              spec.roof.apex = Math.abs(Math.round(Math.max(Math.min((this.selectedBall.position.y * 25.0), 4600), 2800) / 100) * 100)
              break;
            case "z":
              // console.log()
              spec.frames = Math.max(Math.min(
                Math.abs(Math.round((-rev(this.selectedBall.position.z)*2)/1200) + 1)
              , 11), 4)
              break;
          }
          this.updateWikiHouse()
        }
      } else {
        this.renderer.domElement.style.cursor = '-webkit-grab'
      }
    } else {
      this.renderer.domElement.style.cursor = 'default'
    }
  }

  controlsMouseDown(event){
    this.controls.enabled = false
  }

  onMouseDown(event) {
    this.mouseDown = true
    if (this.selectedBall) {
      this.selectedBall.originalPosition = this.selectedBall.position
      this.renderer.domElement.style.cursor = '-webkit-grabbing'
    }
  }

  onDoubleClick(event) {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    let intersects = this.raycaster.intersectObjects([...window.components.roof, ...window.components.ceiling, ...window.components.outerWall, ...window.components.innerWall])
    if (intersects.length >= 1) {
      intersects.sort(s => s.distance).reverse().slice(0,2).forEach(i => i.object.visible = false)
    }
  }

  onMouseWheel(event) {
    // this.animate()
    updateTime = Date.now()
  }

  onMouseUp(event) {
    if (event.which === 3) {
      // right click


    }

    this.offset = null
    this.mouseDown = false
    this.selectedBall = null
    this.controls.enabled = true
    this.renderer.domElement.style.cursor = this.selectedBall ? '-webkit-grab' : 'default'
  }

  render() {
    return (
      <div id="container" className="App"></div>
    )
  }

  wikihouse() {
    let MicroHouse = new THREE.Object3D();

    window.components = {}

    spec.length = (spec.frames-1) * 1200;
    spec.floorArea = ((spec.width - 500) * spec.length);
    const opposite = spec.roof.apex-spec.leftWall.height;
    const adjacent = spec.width/2;
    spec.roof.length = Math.hypot(adjacent, opposite);
    spec.roofArea = spec.roof.length * spec.length * 2;

    spec.roof.angle = Math.PI/2 - Math.atan(opposite/adjacent);
    const outerPoints = [
      [0, spec.roof.apex],
      [spec.width/2, spec.rightWall.height],
      [spec.width/2, 0],

        [spec.width/2-84, 0, true],
        [spec.width/2-84, 36, true],
        [spec.width/2-84-74, 36, true],
        [spec.width/2-84-74, 0, true],

        [-spec.width/2+84+74, 0, true],
        [-spec.width/2+84+74, 36, true],
        [-spec.width/2+84, 36, true],
        [-spec.width/2+84, 0, true],

      [-spec.width/2, 0],
      [-spec.width/2, spec.leftWall.height],
    ]
    var outerFramePoints = outerPoints.map(p => new THREE.Vector2(mm(p[0]), mm(p[1])))
    var frameShape = new THREE.Shape(outerFramePoints)

    var paths = [outerPoints.filter(p => !p[2]).map(p => ({X: p[0], Y: p[1]}))]

    const subject = new Shape(paths, true)
    const innerPointsArr = subject.offset(-250, {
      jointType: 'jtMiter',
      endType: 'etClosedPolygon',
      miterLimit: 2,
      roundPrecision: 0
    }).paths[0]

    spec.innerPointsRaw = innerPointsArr.map(p => [mm(p.X),mm(p.Y)])

    spec.innerPoints = innerPointsArr.map(p => new THREE.Vector2(mm(p.X), mm(p.Y)))

    const innerOpposite = spec.innerPoints[1].y-spec.innerPoints[2].y
    const innerAdjacent = spec.innerPoints[2].x
    spec.roof.innerLength = rev(Math.hypot(innerAdjacent, innerOpposite))
    spec.innerHeight = rev(spec.innerPoints[2].y - spec.innerPoints[3].y)
    spec.innerFullHeight = rev(spec.innerPoints[1].y - spec.innerPoints[3].y)
    spec.innerWidth = rev(spec.innerPoints[4].x - spec.innerPoints[3].x)

    spec.outerFrameArea = (spec.width * spec.leftWall.height) + ((spec.roof.apex - spec.leftWall.height) * spec.width)/2;
    spec.innerFrameArea = (spec.innerWidth * spec.innerHeight) + ((spec.innerFullHeight - spec.innerHeight) * spec.innerWidth)/2;


    spec.internalVolume = spec.innerFrameArea * spec.length

    spec.frameArea = spec.outerFrameArea - spec.innerFrameArea
    spec.frameVolume = spec.frameArea * spec.length

    spec.insulationVolume = spec.frameVolume// - spec.internalVolume

    spec.wallsArea = (spec.length * spec.leftWall.height) * 2

    var hole = new THREE.Path();
    hole.fromPoints(spec.innerPoints);
    frameShape.holes = [hole];

    var frameGeometry = new THREE.ExtrudeGeometry(frameShape, { steps: 2, amount: mm(150), bevelEnabled: false })

    var frame, insulation, distance = mm(1200)
    var insulationGeometry = new THREE.ExtrudeGeometry(frameShape, { steps: 2, amount: distance - mm(150+6), bevelEnabled: false })

    for (var i = 0; i < spec.frames; i++) {
      frame = new THREE.Mesh(frameGeometry, plywoodMaterial);
      frame.position.z = (i * distance);// -(total/2 * distance);
      frame.position.y = 0;
      // if (spec.visible.shadows) {
        frame.receiveShadow = spec.visible.shadows;
        frame.castShadow = spec.visible.shadows;
      // }

      MicroHouse.add(frame);

      if (spec.visible.insulation && i+1 < spec.frames) {
        insulation = new THREE.Mesh(insulationGeometry, insulationMaterial);
        insulation.position.z = (i * distance) + mm(150 + 3);
        frame.position.y = 0;
        // if (spec.visible.shadows) {
          frame.receiveShadow = spec.visible.shadows;
          frame.castShadow = spec.visible.shadows;
        // }
        MicroHouse.add(insulation);
      }

      if (spec.showEdges) {
        var helper = new THREE.EdgesHelper( frame, EDGES_COLOR );
        helper.position.z = frame.position.z;
        helper.matrixAutoUpdate = true;
        helper.material.linewidth = 2;
        MicroHouse.add(helper);
      }
    }

    let geoms = {}
    var components = [

      ['topbar', {
          geom: 'tb',
          position: [-mm(spec.ply.depth/2), spec.innerPoints[1].y-mm(40), mm(20)],
          shape: [
            [0,0],
            [mm(spec.ply.depth), 0],
            [mm(spec.ply.depth), mm(200)],
            [0, mm(200)]
          ],
          depth: mm(spec.length-40),
          rotation: {
            x: 0,
            y: 0,
            z: 0
          }
        }
      ],

      ['topbar', {
          geom: 'tb',
          position: [spec.innerPoints[0].x, spec.innerPoints[0].y, mm(20)],
          shape: [
            [0,0],
            [mm(spec.ply.depth), 0],
            [mm(spec.ply.depth), mm(200)],
            [0, mm(200)]
          ],
          depth: mm(spec.length-40),
          rotation: {
            x: 0,
            y: 0,
            z: -Math.PI/2
          }
        }
      ],

      ['topbar', {
          geom: 'tb',
          position: [-spec.innerPoints[0].x, spec.innerPoints[0].y-mm(spec.ply.depth), mm(20)],
          shape: [
            [0,0],
            [mm(spec.ply.depth), 0],
            [mm(spec.ply.depth), mm(200)],
            [0, mm(200)]
          ],
          depth: mm(spec.length-40),
          rotation: {
            x: 0,
            y: 0,
            z: Math.PI/2
          }
        }
      ],

      ['bar', {
          geom: 'a',
          position: [-mm(spec.width/2 - 84), -mm(200-36), 0],
          shape: [
            [0,0],
            [mm(74), 0],
            [mm(74), mm(200)],
            [0, mm(200)]
          ],
          depth: mm(spec.length + 150),//mm(4800),
          rotation: {
            x: 0,
            y: 0,
            z: 0
          },
          material: barMaterial
        }
      ],

      ['bar', {
          geom: 'b',
          position: [mm(spec.width/2 - 84 - 74), -mm(200-36), 0],
          shape: [
            [0,0],
            [mm(74), 0],
            [mm(74), mm(200)],
            [0, mm(200)]
          ],
          depth: mm(spec.length + 150),//mm(4800),
          rotation: {
            x: 0,
            y: 0,
            z: 0
          },
          material: barMaterial
        }
      ],

      ['frontWall', {
          geom: 'w',
          position: [0,0,0],
          shape: [
            spec.innerPointsRaw[0],
            spec.innerPointsRaw[1],
            spec.innerPointsRaw[2],
            spec.innerPointsRaw[3],
            [spec.innerPointsRaw[4][0]-Math.min(spec.innerPointsRaw[4][0]*2, mm(2100)),spec.innerPointsRaw[4][1] ],
            [spec.innerPointsRaw[4][0]-Math.min(spec.innerPointsRaw[4][0]*2, mm(2100)),spec.innerPointsRaw[4][1]+mm(2000) ]
          ],
          depth: mm(286),
          rotation: {
            x: 0,
            y: 0,
            z: 0
          }
        }
      ],

      ['backWall', {
          geom: 'w',
          position: [0,0,mm(spec.length + 286/2)],
          shape: [
            spec.innerPointsRaw[0],
            spec.innerPointsRaw[1],
            spec.innerPointsRaw[2],
            spec.innerPointsRaw[3],
            [spec.innerPointsRaw[4][0]-Math.min(spec.innerPointsRaw[4][0]*2, mm(2100)),spec.innerPointsRaw[4][1] ],
            [spec.innerPointsRaw[4][0]-Math.min(spec.innerPointsRaw[4][0]*2, mm(2100)),spec.innerPointsRaw[4][1]+mm(2000) ]
          ],
          depth: mm(286),
          rotation: {
            x: 0,
            y: Math.PI,
            z: 0
          }
        }
      ],
    ]

    for (var i = 0; i < spec.frames-1; i++) {

      // components.push(
      //   ['jackpads', {
      //       geom: 'jack',
      //       material: jackpadMaterial,
      //       position: [-mm(spec.width/2-450/2+225), -mm(200), mm(75 + (i * 1200))],
      //       shape: [
      //         [0,0],
      //         [mm(450), 0],
      //         [mm(450), mm(450)],
      //         [0, mm(450)]
      //       ],
      //       depth: mm(130),
      //       rotation: {
      //         x: Math.PI/2,
      //         y: 0,
      //         z: 0
      //       }
      //     }
      //   ]
      // )

      components.push(
        ['roof', {
            geom: 'c',
            position: [0, mm(spec.roof.apex), mm(75 + (i * 1200) +3 )],
            shape: [
              [0,0],
              [mm(1200-6), 0],
              [mm(1200-6), mm(Math.min(2400,spec.roof.length))],
              [0, mm(Math.min(2400,spec.roof.length))]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: spec.roof.angle - Math.PI,
              y: -Math.PI/2,
              z: 0
            }
          }
        ]
      )

      if (i === 0) {
        components.push(
          ['roof', {
              geom: 'd',
              position: [0, mm(spec.roof.apex), 0],
              shape: [
                [0,0],
                [mm(75), 0],
                [mm(75), mm(Math.min(2400,spec.roof.length))],
                [0, mm(Math.min(2400,spec.roof.length))]
              ],
              depth: mm(spec.ply.depth),
              rotation: {
                x: spec.roof.angle - Math.PI,
                y: -Math.PI/2,
                z: 0
              }
            }
          ]
        )
      }

      if (i === 0) {
        // components.push(
        //   ['roof', {
        //       position: [0, mm(spec.roof.apex), mm(1200)],
        //       shape: [
        //         [0,0],
        //         [mm(75), 0],
        //         [mm(75), mm(Math.min(2400,spec.roof.length))],
        //         [0, mm(Math.min(2400,spec.roof.length))]
        //       ],
        //       depth: mm(40),
        //       rotation: {
        //         x: spec.roof.angle,
        //         y: -Math.PI/2,
        //         z: - Math.PI
        //       }
        //     }
        //   ]
        // )
      }

      components.push(
        ['roof', {
            geom: 'e',
            position: [0, mm(spec.roof.apex), mm(75 + 1200 + (i * 1200) +3) ],
            shape: [
              [0,0],
              [mm(1200 -6), 0],
              [mm(1200 -6), mm(Math.min(2400,spec.roof.length))],
              [0, mm(Math.min(2400,spec.roof.length))]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: spec.roof.angle,
              y: -Math.PI/2,
              z: - Math.PI
            }
          }
        ],
      )


      if (spec.roof.length > 2400) {
        components.push(
          ['roof', {
              geom: 'f',
              position: [0, mm(spec.roof.apex), mm(75 + (i * 1200) +3 )],
              shape: [
                [0, mm(2400 + 3)],
                [mm(1200-6), mm(2400 + 3)],
                [mm(1200-6), mm(spec.roof.length)],
                [0, mm(spec.roof.length)]
              ],
              depth: mm(spec.ply.depth),
              rotation: {
                x: spec.roof.angle - Math.PI,
                y: -Math.PI/2,
                z: 0
              }
            }
          ]
        )

        components.push(
          ['roof', {
              geom: 'g',
              position: [0, mm(spec.roof.apex), mm(75 + 1200 + (i * 1200) +3) ],
              shape: [
                [0,mm(2400 + 3)],
                [mm(1200 -6), mm(2400 + 3)],
                [mm(1200 -6), mm(spec.roof.length)],
                [0, mm(spec.roof.length)]
              ],
              depth: mm(spec.ply.depth),
              rotation: {
                x: spec.roof.angle,
                y: -Math.PI/2,
                z: - Math.PI
              }
            }
          ],
        )

      }


      components.push(
        ['ceiling', {
            geom: 'h',
            position: [mm(spec.width/2-250), spec.innerPoints[2].y, mm(75 + (i * 1200) +3)],
            shape: [
              [0,0],
              [mm(1200-6), 0],
              [mm(1200-6), mm(spec.roof.innerLength - spec.ply.depth)],
              [0, mm(spec.roof.innerLength - spec.ply.depth)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: spec.roof.angle,
              y: -Math.PI/2,
              z: 0
            }
          }
        ]
      )

      components.push(
        ['ceiling', {
            geom: 'i',
            position: [-mm(spec.width/2-250), spec.innerPoints[2].y, mm(75+1200 + (i * 1200) +3)],
            shape: [
              [0,0],
              [mm(1200-6), 0],
              [mm(1200-6), mm(spec.roof.innerLength)],
              [0, mm(spec.roof.innerLength)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: spec.roof.angle - Math.PI,
              y: -Math.PI/2,
              z: - Math.PI
            }
          }
        ]
      )

      components.push(
        ['innerWall', {
            geom: 'j',
            position: [-mm(spec.width/2-250), mm(250+spec.ply.depth), mm(75+1200 + (i*1200) +3)],
            shape: [
              [0,0],
              [mm(1200 - 6), 0],
              [mm(1200 - 6), mm(spec.innerHeight - spec.ply.depth*2)],
              [0, mm(spec.innerHeight - spec.ply.depth*2)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: 0,
              y: Math.PI/2,
              z: 0
            }
          }
        ],
      )

      components.push(
        ['innerWall', {
            geom: 'k',
            position: [mm(spec.width/2-250-spec.ply.depth), mm(250+spec.ply.depth), mm(75+1200 + (i*1200) +3)],
            shape: [
              [0,0],
              [mm(1200 - 6), 0],
              [mm(1200 - 6), mm(spec.innerHeight - spec.ply.depth*2)],
              [0, mm(spec.innerHeight - spec.ply.depth*2)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: 0,
              y: Math.PI/2,
              z: 0
            }
          }
        ]
      )

      components.push(
        ['outerWall', {
            geom: 'l',
            position: [-mm(spec.width/2), 0, mm(75 + (i*1200) +3)],
            shape: [
              [0,0],
              [mm(1200 - 6), 0],
              [mm(1200 - 6), mm(spec.leftWall.height)],
              [0, mm(spec.leftWall.height)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: 0,
              y: -Math.PI/2,
              z: 0
            }
          }
        ]
      )

      components.push(
        ['outerWall', {
            geom: 'm',
            position: [mm(spec.width/2+spec.ply.depth), 0, mm(75 + (i*1200) +3)],
            shape: [
              [0,0],
              [mm(1200 -6), 0],
              [mm(1200 -6), mm(spec.leftWall.height)],
              [0, mm(spec.leftWall.height)]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: 0,
              y: -Math.PI/2,
              z: 0
            }
          }
        ],
      )


      components.push(
        ['floor', {
            geom: 'n',
            position: [-mm(spec.width/2-250), mm(250), mm(75 + (i*1200) +3)],
            shape: [
              [0,0],
                [mm(75),0],
                [mm(75),-mm(250)],
                [mm(1200-75),-mm(250)],
                [mm(1200-75),0],
              [mm(1200 - 6), 0],
              [mm(1200 - 6), mm(Math.min(2400,spec.width-500))],
              [0, mm(Math.min(2400,spec.width-500))]
            ],
            depth: mm(spec.ply.depth),
            rotation: {
              x: -Math.PI/2,
              y: -Math.PI/2,
              z: 0
            }
          }
        ],
      )

      if (spec.width > 2400) {
        components.push(
          ['floor', {
              geom: 'o',
              position: [mm(spec.width/2-250), mm(250+spec.ply.depth), mm(75 + (i*1200) +3)],
              shape: [
                [0,0],
                  [mm(75),0],
                  [mm(75),-mm(250)],
                  [mm(1200-75),-mm(250)],
                  [mm(1200-75),0],
                [mm(1200 - 6), 0],
                [mm(1200 - 6), mm(spec.width-2400-500 -3)],
                [0, mm(spec.width-2400-500 -3)]
              ],
              depth: mm(spec.ply.depth),
              rotation: {
                x: Math.PI/2,
                y: -Math.PI/2,
                z: 0
              }
            }
          ],
        )
      }
    }


    components.forEach(component => {
      const name = component[0]
      if (!!spec.visible[name]) {

        const { position, shape, depth, vector, rotation, geom } = component[1]
        let vectorPosition = new THREE.Vector3(...position)
        let material = component[1].material || plywoodMaterial

        if (!geoms[geom]) {
          const points = shape.map(xy => new THREE.Vector2(xy[0], xy[1]))
          const pointsShape = new THREE.Shape(points)
          geoms[geom] = new THREE.ExtrudeGeometry(pointsShape, { steps: 1, amount: depth, bevelEnabled: false })
        }

        let mesh = new THREE.Mesh(geoms[geom], material)



        let parent = new THREE.Object3D();

        // showAxes(parent, 30)

        parent.position.copy(vectorPosition);

        parent.rotation.order = 'YZX';
        parent.rotation.x = rotation.x;
        parent.rotation.y = rotation.y;
        parent.rotation.z = rotation.z;

        window.components[name] = window.components[name] || []
        window.components[name].push(mesh)

        mesh.receiveShadow = true;
        mesh.castShadow = spec.visible.shadows;


        parent.add(mesh);
        MicroHouse.add(parent);

        if (spec.showEdges) {
          var eg = new THREE.EdgesGeometry( mesh.geometry );
          var em = new THREE.LineBasicMaterial( { color: EDGES_COLOR, linewidth: 1 } );
          var es = new THREE.LineSegments( eg, em );
          mesh.add( es );
          MicroHouse.add(helper);
        }
      }
    })
    // showAxes(scene, 40);

    var box = new THREE.Box3().setFromObject(MicroHouse)

    setVal('width', spec.width/1000)
    setVal('height', spec.roof.apex/1000)
    setVal('length', spec.length/1000)

    setVal('floor-area', spec.floorArea/1000000)
    setVal('roof-area', spec.roofArea/1000000)
    setVal('walls-area', spec.wallsArea/1000000)

    // setVal('internal-volume', spec.innerFrameArea)

    spec.footprint = (spec.width * spec.length)/1000000
    setVal('footprint', spec.footprint)
    spec.insulationVolume = spec.insulationVolume/1000000000
    setVal('insulation-volume', spec.insulationVolume)
    spec.insulationCost = spec.insulationVolume * 25.0
    setVal('insulation-cost', spec.insulationCost)

    setVal('internal-volume', spec.internalVolume/1000000000)

    spec.plywoodSheets = Math.floor(spec.internalVolume/1000000000 * 1.85) + 16
    spec.plywoodCost = 22.30 * spec.plywoodSheets
    spec.plywoodManufactureCost = 25.00 * spec.plywoodSheets
    spec.plywoodTotal = spec.plywoodCost + spec.plywoodManufactureCost
    setVal('plywood-sheets', spec.plywoodSheets, false)
    setVal('plywood-cost', spec.plywoodCost)
    setVal('plywood-manufacture-cost', spec.plywoodManufactureCost)
    setVal('plywood-total', spec.plywoodTotal)

    setVal('total-cost', (spec.plywoodTotal + spec.insulationCost).toFixed(2).toString().replace(/(\d)(?=(\d{3})+\.)/g, '$1,'), false)

    return MicroHouse;
  }
}

export default App
