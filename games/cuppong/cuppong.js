import * as THREE from 'https://cdn.skypack.dev/three';
import * as CANNON from 'https://cdn.skypack.dev/cannon-es';
import Stats from '../stats.module.js';
import { loadGLTF, loadTexture, GLTFtoConvexPolyhedron, setupScene } from '../core.js';

const endpoint = 'https://cheese2api.azurewebsites.net/api';

const cupZOffset = 18;
const cupPositions10 = [
    [-3.5, 5], [-1.25, 5], [1.25, 5], [3.5, 5],
    [-2.25, 3], [0, 3], [2.25, 3],
    [-1.25, 1], [1.25, 1],
    [0, -1],
].map(p => new THREE.Vector3(p[0], 2, p[1] + cupZOffset));

const cupPositions6 = [
    [-2.25, 4], [0, 4], [2.25, 4],
    [-1.25, 2], [1.25, 2],
    [0, 0],
].map(p => new THREE.Vector3(p[0], 2, p[1] + cupZOffset));

const cupPositions3 = [
    [-1.25, 3], [1.25, 3],
    [0, 1],
].map(p => new THREE.Vector3(p[0], 2, p[1] + cupZOffset));

class CupPongApp {
    constructor(scene, world, camera, renderer) {
        Object.assign(this, {scene: scene, world: world, camera: camera, renderer: renderer, raycaster: new THREE.Raycaster()})
        this.clock = new THREE.Clock();
        this.actionable = false;

        this.mouseRaw = new THREE.Vector2();
        this.mouseRaw2 = new THREE.Vector2();
        this.mouse = new THREE.Vector2();
        this.touchStarted = false;
        this.waitInterval = null;
        this.released = null;
        this.animations = [];

        let urlParams = new URLSearchParams(window.location.search);
        this.gameID = urlParams.get('id');
        this.userID = urlParams.get('us');

        this.currentThrow = [];
        this.selfData = {
            activeCups: [],
            ...JSON.parse(localStorage.getItem('cheese2-cp')) || {
                ballLeft: true,
                ballTrajectories: []
            },
            cupsHit: []
        }
        this.opponentData = {
            activeCups: [],
            ballTrajectories: [],
            cupsHit: []
        }

        document.addEventListener('touchstart', this.handleTouchStart.bind(this), false);
        document.addEventListener('mousedown', this.handleTouchStart.bind(this), false);
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), false);
        document.addEventListener('mousemove', this.handleTouchMove.bind(this), false);
        document.addEventListener('touchend', this.endTouch.bind(this), false);
        document.addEventListener('mouseup', this.endTouch.bind(this), false);

        this.load().then(() => {
            this.connectToServer()
                .catch((err) => {
                    document.getElementById('connecting').style.display = 'none';
                    if (err.message === '401') {
                        document.getElementById('waiting').style.display = 'block';
                        if (!this.waitInterval) {
                            this.waitInterval = setInterval(this.waitForOpponent.bind(this), 5000);
                        }
                    } else {
                        document.getElementById('nogame').style.display = 'block';
                    }
                })
        });
    }

    async waitForOpponent() {
        if (!document.hasFocus()) return;

        this.connectToServer().catch((err) => {
            if (err.message == '404') {
                document.getElementById('waiting').style.display = 'none';
                clearInterval(this.waitInterval);
                document.getElementById('won').style.display = 'block';
            } else if (err.message != '401') {
                document.getElementById('waiting').style.display = 'none';
                clearInterval(this.waitInterval);
                document.getElementById('nogame').style.display = 'block';
            }
        });
    }

    async connectToServer() {
        if (!this.gameID || !this.userID) throw new Error('No Game ID or User specified');

        let resp = await fetch(`${endpoint}/fetchSession/${this.gameID}/${this.userID}`).catch(() => {})

        if (!resp.ok) throw new Error(resp.status.toString());

        if (this.waitInterval) clearInterval(this.waitInterval);
        this.waitInterval = null;
        
        let json = await resp.json()
        document.getElementById('connecting').style.display = 'none';
        document.getElementById('modal').style.display = 'none';

        // update cup locations if new load (10 cups)
        if (this.selfData.activeCups.length === 10) {
            this.selfData.activeCups = this.selfData.activeCups.filter((cup, index) => {
                if (!json.activeCups.includes(index)) {
                    this.scene.remove(cup);
                    this.world.removeBody(cup.body);
                    return false;
                }
                return true;
            });
            if (this.selfData.activeCups.length <= 6) {
                if (this.selfData.activeCups.length <= 3) {
                    // 1 - 3 cup positions
                    this.selfData.activeCups.forEach((cup, index) => {
                        cup.position.copy(cupPositions3[index]);
                        cup.body.position.copy(cup.position);
                    })
                } else {
                    // 4 - 6
                    this.selfData.activeCups.forEach((cup, index) => {
                        cup.position.copy(cupPositions6[index]);
                        cup.body.position.copy(cup.position);
                    })
                }
            }
            // already in 10 cup position
        }
        
        this.opponentData.ballTrajectories = json.data.ballTrajectories;
        this.opponentData.cupsHit = json.data.cupsHit;

        // update opponent cup locations
        this.opponentData.activeCups = this.opponentData.activeCups.filter((cup, index) => {
            // CupsHit means the cup will be removed as the animation plays - WIP
            if (!json.data.activeCups.includes(parseInt(cup.userData.index))) { //&& !json.data.cupsHit.includes(parseInt(cup.userData.index))) {
                this.scene.remove(cup);
                this.world.removeBody(cup.body);
                return false;
            }
            return true;
        });
        if (this.opponentData.activeCups.length <= 6) {
            if (this.opponentData.activeCups.length % 3 === 0) {
                // reset cup ids
                this.opponentData.activeCups.forEach((cup, index) => {
                    cup.userData.index = index;
                })
            }
            let offset = new THREE.Vector3(-1, 1, -1);
            if (this.opponentData.activeCups.length <= 3) {
                // 1 - 3 cup positions
                this.opponentData.activeCups.forEach((cup, index) => {
                    cup.position.set(
                        cupPositions3[index].x * -1,
                        cupPositions3[index].y,
                        cupPositions3[index].z * -1
                    );
                    cup.body.position.copy(cup.position);
                })
            } else {
                // 4 - 6
                this.opponentData.activeCups.forEach((cup, index) => {
                    cup.position.set(
                        cupPositions6[index].x * -1,
                        cupPositions6[index].y,
                        cupPositions6[index].z * -1
                    );
                    cup.body.position.copy(cup.position);
                })
            }
            // already in 10 cup position
        }
        

        this.beginGameplay();
    }

    async sendOut() {
        document.getElementById('modal').style.display = 'block';
        document.getElementById('waiting').style.display = 'block';

        // Don't update in the background - waste!
        if (!document.hasFocus()) {
            setTimeout(this.sendOut.bind(this), 3000);
            return;
        }

        let resp = await fetch(`${endpoint}/updateSession/${this.gameID}/${this.userID}`, {
            method: 'POST',
            body: JSON.stringify({
                activeCups: this.selfData.activeCups.map(cup => cup.userData.index),
                ballTrajectories: this.selfData.ballTrajectories,
                cupsHit: this.selfData.cupsHit
            })
        }).catch(() => {})

        if (!resp) {
            document.getElementById('waiting').style.display = 'none';
            document.getElementById('nogame').style.display = 'block';
            return;
        }
        if (!resp.ok) {
            setTimeout(this.sendOut.bind(this), 3000);
            return;
        }

        localStorage.removeItem('cheese2-cp');
        this.selfData = {
            activeCups: this.selfData.activeCups,
            ballLeft: true,
            ballTrajectories: [],
            cupsHit: []
        }

        let json = await resp.json();
        // does it exist?
        if (json.winner !== undefined) {
            // is it true
            document.getElementById('modal').style.display = 'block';
            document.getElementById('waiting').style.display = 'none';
            if (json.winner) {
                document.getElementById('won').style.display = 'block';
            } else {
                document.getElementById('lost').style.display = 'block';
            }
            return;
        }

        if (!this.waitInterval) {
            this.waitInterval = setInterval(this.waitForOpponent.bind(this), 5000);
        }
    }

    async load() {
        this.world.gravity.set(0, -90, 0)
        // position camera
        this.camera.position.set(0, 20, 0);
        this.camera.lookAt(0, 0, 10)

        // Add light
        const light = new THREE.DirectionalLight( 0xffffff, 0.8 );
        light.castShadow = true;
        light.position.set(-15, 35, 0);
        light.target.position.set(0, 0, 15);
        let d = 40;
        light.shadow.mapSize.set(1024, 1024)
        light.shadow.camera.left = - d;
        light.shadow.camera.right = d;
        light.shadow.camera.top = d;
        light.shadow.camera.bottom = - d;
        light.shadow.camera.near = 0.1;
		light.shadow.camera.far = 100;

        this.scene.add(light);
        this.scene.add(light.target);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);


        // Add table, floor, wall
        this.scene.add(await this.createTable());
        this.scene.add(await this.createBackWall());
        this.scene.add(await this.createFloor());

        // Create cups in array of 10
        this.cupMaterial = new CANNON.Material('cup');
        for (let i = 0; i < 10; i++) {
            let newCup = await this.createCup();
            newCup.userData.index = i;
            newCup.position.copy(cupPositions10[i]);
            newCup.updateMatrix();
            //newCup.visible = false;
            this.scene.add(newCup);
            this.selfData.activeCups.push(newCup);
            // CANNON physics
            newCup.body = await GLTFtoConvexPolyhedron('./cup-bounds.glb', {material: this.cupMaterial, type: CANNON.Body.STATIC});
            newCup.body.position.copy(newCup.position);
            this.world.addBody(newCup.body);

            // Visualize cup bounds (DEBUG)
            /*const gltf = await loadGLTF('./cup-bounds.glb');
            const group = new THREE.Group();
            group.children = gltf.scene.children;
            group.children.forEach((c) => c.position.copy(newCup.position))
            group.updateMatrix();
            this.scene.add(group);*/
        }
        // load opponent cups
        let offset = new THREE.Vector3(-1, 1, -1);
        for (let i = 0; i < 10; i++) {
            let newCup = await this.createCup();
            newCup.position.copy(cupPositions10[i].multiply(offset));
            newCup.userData.index = i;
            newCup.updateMatrix();
            //newCup.visible = false;
            this.scene.add(newCup);
            this.opponentData.activeCups.push(newCup);
            // CANNON physics
            newCup.body = await GLTFtoConvexPolyhedron('./cup-bounds.glb', {material: this.cupMaterial, type: CANNON.Body.STATIC});
            newCup.body.position.copy(newCup.position);
            this.world.addBody(newCup.body);
        }

        // Create ball
        this.ball = this.createBall();
        this.scene.add(this.ball);

        // Create Movement Plane for dragging
        this.movementPlane = this.createMovementPlane();
        this.scene.add(this.movementPlane);

        // https://github.com/pmndrs/cannon-es/blob/master/examples/threejs_mousepick.html - Joint for dragging
        const jointShape = new CANNON.Sphere(0.1)
        this.jointBody = new CANNON.Body({ mass: 0 })
        this.jointBody.addShape(jointShape)
        this.jointBody.collisionFilterGroup = 0
        this.jointBody.collisionFilterMask = 0
        this.world.addBody(this.jointBody)

        // Add ball fade in animation
        this.fadeIn = {
            object: this.ball,
            length: 0.25,
            time: 0,
            onStart: (ball, length) => {
                ball.visible = true;
                ball.material.opacity = 0;
                ball.castShadow = false;
                ball.body.position.set(0, 0.5, 2);
                ball.body.velocity.set(0, 0, 0);
            },
            callback: (ball, time, length) => {
                ball.material.opacity = time / length;
            },
            onEnd: (ball, length) => {
                this.actionable = true;
                ball.castShadow = true;
                ball.material.opacity = 1;
            }
        }

        this.animate();
    }

    createMovementPlane() {
        const movementCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(8, 8, 20, 32),
            new THREE.MeshStandardMaterial({color: 0xff0000, side: THREE.DoubleSide})
        );
        movementCylinder.visible = false // Hide it..
        movementCylinder.position.set(0, 0, 10);
        movementCylinder.scale.x = 1.15;
        movementCylinder.rotation.z = - Math.PI / 2;
        return movementCylinder;
    }

    async createTable() {
        const tableMaterial = new THREE.MeshPhongMaterial( { map: await loadTexture('./table.jpg')  } );
        const mesh = new THREE.Mesh( new THREE.BoxGeometry(18, 1, 55), tableMaterial );
        mesh.position.y = -0.5;
        //mesh.rotation.x = - Math.PI / 2;
        mesh.receiveShadow = true;
        mesh.castShadow = true;

        // CANNON physics
        this.cannonTableMaterial = new CANNON.Material('ground')

        mesh.body = new CANNON.Body({ material: this.cannonTableMaterial, type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(9, 1, 27.5)) });
        mesh.body.position.y = -1;
        this.world.addBody(mesh.body);

        return mesh;
    }
    
    async createBackWall() {
        const wallGeometry = new THREE.PlaneGeometry(180, 30);
        const wallTexture = await loadTexture('./wall.jpg');
        wallTexture.repeat = new THREE.Vector2(6, 3);
        wallTexture.wrapS = THREE.RepeatWrapping;
        wallTexture.wrapT = THREE.RepeatWrapping;
        const wallMaterial = new THREE.MeshStandardMaterial( { map: wallTexture, side: THREE.DoubleSide } );
        const mesh = new THREE.Mesh( wallGeometry, wallMaterial );
        mesh.position.z = 40;
        mesh.receiveShadow = true;
        return mesh;
    }
    
    async createFloor() {
        const floorGeometry = new THREE.PlaneGeometry(180, 100);
        let floorTexture = await loadTexture('./floor.jpg');
        floorTexture.repeat = new THREE.Vector2(4, 2);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        const floorMaterial = new THREE.MeshPhongMaterial( { map: floorTexture } );
        const mesh = new THREE.Mesh( floorGeometry, floorMaterial );
        mesh.rotation.x = - Math.PI / 2;
        mesh.position.y = -20;
        mesh.receiveShadow = true;
        return mesh;
    }
    
    async createCup() {
        if (!this.cup) {
            const gltf = await loadGLTF('./cup.glb');
            this.cup = gltf.scene.children[0];
            this.cup.castShadow = true;
        }
        return this.cup.clone();
    }
    
    createBall() {
        const ballGeometry = new THREE.SphereBufferGeometry(0.5);
        const ballMaterial = new THREE.MeshStandardMaterial( { color: 0xffffff, transparent: true } );
        const ball = new THREE.Mesh( ballGeometry, ballMaterial );
        ball.position.z = 2;
        ball.position.y = 0.5;
        ball.castShadow = true;

        // CANNON physics
        let material = new CANNON.Material('ball')

        const ballShape = new CANNON.Sphere(0.5);
        ball.body = new CANNON.Body({ material: material, mass: 10 });
        ball.body.linearDamping = 0.1;
        ball.body.addShape(ballShape);
        ball.body.position.set(0, 0.5, 2);
        this.world.addBody(ball.body);

        this.world.addContactMaterial(new CANNON.ContactMaterial(this.cannonTableMaterial, material, { friction: 0.0, restitution: 0.7 }))
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.cupMaterial, material, { friction: 0.0, restitution: 0.7 }))

        return ball;
    }

    // START gameplay and play back opponents actions
    async beginGameplay() {
        if (!this.selfData.ballLeft && this.selfData.ballTrajectories.length >= 2 && !(this.selfData.cupsHit.length != 0 && this.selfData.cupsHit.length % 2 != 0)) {
            return await this.sendOut();
        }
        document.getElementById('ball-left').style.display = this.selfData.ballLeft ? 'block' : 'none';
        if (this.opponentData.ballTrajectories.length > 0) {
            this.camera.position.z = -30;

            for (let i = 0; i < this.opponentData.ballTrajectories.length; i++) {
                await this.replayBall(true, this.opponentData.ballTrajectories[i]);
            }

            await new Promise(r => setTimeout(r, 1000));
            await new Promise((resolve, reject) => {
                this.animations.push({
                    object: this.camera,
                    length: 0.5,
                    time: 0,
                    onStart: () => {},
                    callback: (camera, time, length) => {
                        camera.position.z = -30 + (time / length) * 30;
                    },
                    onEnd: resolve
                })
            })
            this.camera.position.z = 0;
        }
        if (!(this.ball.position.x == 0 && this.ball.position.y == 0.5 && this.ball.position.z == 2)) {
            this.animations.push(Object.assign({}, this.fadeIn))
        } else {
            this.visible = true;
            this.opacity = 1;
            this.actionable = true;
        }
        if (this.opponentData.activeCups.length == 0) {
            document.getElementById('modal').style.display = 'block';
            document.getElementById('redemption').style.display = 'block';
            setTimeout(() => {
                document.getElementById('modal').style.display = 'none';
                document.getElementById('redemption').style.display = 'none';
            }, 1000)
        }
    }

    // Replay ball
    async replayBall(isOpponent, ballTrajectory) {
        /*this.ball.body.position.set(0, 0.5, 2);

        // Create joint constraint
        const vector = new CANNON.Vec3(0, 0.5, 2).vsub(this.ball.body.position)

        // Apply anti-quaternion to vector to tranform it into the local body coordinate system
        const antiRotation = this.ball.body.quaternion.inverse()
        const pivot = antiRotation.vmult(vector) // pivot is not in local body coordinates

        // Move the cannon click marker body to the click position
        this.jointBody.position.set(ballTrajectory[0].x, ballTrajectory[0].y, ballTrajectory[0].z)

        // Create a new constraint
        // The pivot for the jointBody is zero
        this.jointConstraint = new CANNON.PointToPointConstraint(this.ball.body, pivot, this.jointBody, new CANNON.Vec3(0, 0, 0))

        // Add the constraint to world
        this.world.addConstraint(this.jointConstraint)

        setTimeout(this.endTouch.bind(this), 200);
        
        
        this.animations.push({
            object: this.ball,
            length: 0.2,
            time: 0,
            onStart: () => {},
            callback: (ball, time, length) => {

            },
            onEnd: () => {}
        })*/
    }

    animate() {
        let delta = this.clock.getDelta();
        this.renderer.render(this.scene, this.camera);
        this.stats.update();
        this.world.fixedStep(delta);

        this.ball.position.copy(this.ball.body.position);
        this.ball.quaternion.copy(this.ball.body.quaternion);

        requestAnimationFrame(this.animate.bind(this));

        if (this.animations.length) {
            /* Animation format: {
                object: THREE.Object3D,
                length: number, // the full length of the animation
                time: number, // how long it has been since the animation started
                callback: function(object, time, length)
                onStart: function(object, length)
                onEnd: function(object, length)
            }*/
            let needsUpdate = [];
            for (let i = 0; i < this.animations.length; i++) {
                if (this.animations[i].time === 0) {
                    this.animations[i].onStart(this.animations[i].object, this.animations[i].length);
                    this.animations[i].onStart = () => {};
                }

                this.animations[i].time += delta;

                this.animations[i].callback(this.animations[i].object, this.animations[i].time, this.animations[i].length);

                if (this.animations[i].time >= this.animations[i].length) {
                    needsUpdate.push(this.animations[i]);
                }
            }
            if (needsUpdate.length) {
                this.animations = this.animations.filter(a => {return a.length >= a.time});
                for (let i = 0; i < needsUpdate.length; i++) {
                    // reset time in case this object is reused
                    needsUpdate[i].time = 0;
                    needsUpdate[i].onEnd(needsUpdate[i].object, needsUpdate[i].length);
                }
            }
        }

        if (this.touchStarted) {
            this.currentThrow.push({d: delta,
                x: this.jointBody.position.x,
                y: this.jointBody.position.y,
                z: this.jointBody.position.z,
            })
        }
        if (this.released !== null) {
            // Check positions
            const ballPosition = new THREE.Vector2(this.ball.position.x, this.ball.position.z);
            if (!this.actionable) {
                // demo mode
                ballPosition.multiply(new THREE.Vector2(-1, -1));
            }
            if (Date.now() - this.released > 3000) {
                this.ballReset();
            } else if (this.ball.position.y < -10) {
                // ball hit the floor, reset
                this.ballReset();
            } else if (this.ball.position.y < 1.5) {
                // check cups
                for (let i = 0; i < this.selfData.activeCups.length; i++) {
                    let cupPosition = new THREE.Vector2(this.selfData.activeCups[i].position.x, this.selfData.activeCups[i].position.z);
                    const distance = ballPosition.distanceTo(cupPosition);
                    if (distance < 1) {
                        // ball hit cup
                        this.cupHit(this.selfData.activeCups[i]);
                        return;
                    }
                }
                if (this.ball.body.position.z < -0.5 || (this.ball.body.position.z < 10 && this.ball.body.velocity.z < -1)) {
                    // ball hit the wall
                    this.ballReset();
                    return;
                }
            }
        }
    }


    cupHit(cup) {
        this.ball.visible = false;
        this.selfData.cupsHit.push(cup.userData.index);
        this.released = null;
        this.actionable = false;
        cup.userData.startPos = cup.position.x;
        this.animations.push({
            object: cup,
            length: 0.5,
            time: 0,
            onStart: () => {},
            callback: (cup, time, length) => {
                if (time / length < 0.5) {
                    // go up
                    cup.position.y = 2 + (time / length) * 8;
                } else {
                    // slide out
                    cup.position.x = cup.userData.startPos + (time / length - 0.5) * 16 * (cup.userData.startPos < 0 ? -1 : 1);
                }
            },
            onEnd: (cup, length) => {
                this.scene.remove(cup);
                this.world.removeBody(cup.body);
                this.selfData.activeCups = this.selfData.activeCups.filter(c => c !== cup);
                if (this.selfData.activeCups.length === 6) {
                    this.selfData.activeCups.forEach((currentCup, index) => {
                        currentCup.position.copy(cupPositions6[index]);
                        currentCup.userData.index = index;
                        currentCup.body.position.copy(currentCup.position);
                    })
                } else if (this.selfData.activeCups.length === 3) {
                    this.selfData.activeCups.forEach((currentCup, index) => {
                        currentCup.position.copy(cupPositions3[index]);
                        currentCup.userData.index = index;
                        currentCup.body.position.copy(currentCup.position);
                    })
                }


                this.ballReset(false);
            }
        })
        
    }

    ballReset(fadeOut=true) {
        this.released = null;
        this.actionable = false;
        let checking = () => {
            if (this.selfData.ballLeft) {
                document.getElementById('ball-left').style.display = 'none';
                this.selfData.ballLeft = false;
            } else {
                if (this.selfData.cupsHit.length === this.selfData.ballTrajectories.length) {
                    // balls back!
                    document.getElementById('ball-left').style.display = 'block';
                    this.selfData.ballLeft = true;
                } else {
                    // send results - THIS CHECK IS A HACK and i should probably prevent this function from running multiple times
                    if (this.selfData.ballTrajectories.length >= 2) {
                        this.sendOut();
                        return;
                    }
                }
            }
            this.animations.push(Object.assign({}, this.fadeIn));
        }
        if (fadeOut) {
            this.animations.push({
                object: this.ball,
                length: 0.25,
                time: 0,
                onStart: (ball, length) => {
                    ball.visible = true;
                    ball.castShadow = false;
                },
                callback: (ball, time, length) => {
                    ball.material.opacity = 1 - time / length;
                },
                onEnd: checking
            })
        } else {
            checking()
        }
    }
    
    // Touch

    calculateMouse(mouseRaw) {
        return new THREE.Vector2((mouseRaw.x / window.innerWidth) * 2 - 1, - (mouseRaw.y / window.innerHeight) * 2 + 1);
    }

    handleTouchStart(evt) {
        if (this.actionable && evt.target instanceof HTMLCanvasElement) {
            this.mouseRaw.x = evt.clientX || evt.touches[0].clientX;
            this.mouseRaw.y = evt.clientY || evt.touches[0].clientY;
            this.mouse = this.calculateMouse(this.mouseRaw);

            this.raycaster.setFromCamera(this.mouse, this.camera );
            const intersect = this.raycaster.intersectObject(this.ball);

            if (intersect.length > 0) {
                this.touchStarted = true;

                // Move the cannon click marker body to the click position
                this.jointBody.position.copy(intersect[0].point)

                // Create a new constraint
                // The pivot for the jointBody is zero
                this.jointConstraint = new CANNON.PointToPointConstraint(this.ball.body, new CANNON.Vec3(0, 0, 0), this.jointBody, new CANNON.Vec3(0, 0, 0))

                // Add the constraint to world
                this.world.addConstraint(this.jointConstraint)

                setTimeout(this.endTouch.bind(this), 200);
            }
        }
    };

    endTouch() {
        if (!this.touchStarted) return;
        this.touchStarted = false;

        let change = new THREE.Vector2(this.mouseRaw2.x - this.mouseRaw.x, this.mouseRaw2.y - this.mouseRaw.y);

        this.selfData.ballTrajectories.push(JSON.parse(JSON.stringify(this.currentThrow)));
        this.currentThrow = [];
        localStorage.setItem('cheese2-cp', JSON.stringify({ballTrajectories: this.selfData.ballTrajectories, ballLeft: this.selfData.ballLeft}));

        this.world.removeConstraint(this.jointConstraint);
        delete this.jointConstraint;

        if (-change.y > 50) {
            // Big enough change
            this.released = Date.now();
        } else {
            this.ball.body.velocity.set(0, 0, 0);
            this.ball.body.position.set(0, 0.5, 2);
        }
    }

    handleTouchMove(evt) {
        if (!this.touchStarted) return;

        this.mouseRaw2.x = evt.clientX || evt.touches[0].clientX;
        this.mouseRaw2.y = evt.clientY || evt.touches[0].clientY

        this.raycaster.setFromCamera(this.calculateMouse(this.mouseRaw2), this.camera );
        const intersect = this.raycaster.intersectObject(this.movementPlane);

        if (intersect.length > 0) {
            this.jointBody.position.copy(intersect[0].point);
        }
    };

}

document.addEventListener('touchmove', (event) => {event.preventDefault()}, {passive: false});

window.onload = function() {
    new CupPongApp(...setupScene());
}