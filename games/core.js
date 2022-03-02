import * as THREE from 'https://cdn.skypack.dev/three';
import * as CANNON from 'https://cdn.skypack.dev/cannon-es';
import { GLTFLoader } from './GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

/**
 * Creates a basic scene and returns the scene, camera, and renderer.
 * Appends the renderer to DOM.
 * @returns {[THREE.Scene, CANNON.World, Three.Camera, Three.Renderer]}
 */
export function setupScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera( 65, window.innerWidth / window.innerHeight, 0.1, 1000 );
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.shadowMap.enabled = true;

    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
    })

    renderer.setSize( window.innerWidth, window.innerHeight );

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    document.body.appendChild( renderer.domElement );
    return [scene, world, camera, renderer];
}

/**
 * Loads a GLTF file by path and returns it.
 * @param {String} path 
 * @returns {Object} The loaded GLTF file from GLTFLoader.
 */
export function loadGLTF(path) {
    return new Promise((resolve, reject) => {
        gltfLoader.load(path, (gltf) => {
            resolve(gltf);
        })
    })
}

/**
 * Loads a texture file by path and returns it.
 * @param {String} path 
 * @returns {Object} The loaded GLTF file from GLTFLoader.
 */
 export function loadTexture(path) {
    return new Promise((resolve, reject) => {
        textureLoader.load(path, (texture) => {
            resolve(texture);
        })
    })
}

export async function GLTFtoConvexPolyhedron(path, options) {
    const hullBody = new CANNON.Body(options);

    const gltf = await loadGLTF(path);
    
    gltf.scene.traverse( (obj) => {
    
        if ( obj.geometry ) {
    
            const posAttrib = obj.geometry.attributes.position;
            const vertices = [];
    
            for ( let i=0 ; i<posAttrib.count ; i++ ) {
    
                vertices.push(
                    new CANNON.Vec3(
                        posAttrib.getX( i ),
                        posAttrib.getY( i ),
                        posAttrib.getZ( i )
                    )
                );
    
            }
    
            //
    
            const normAttrib = obj.geometry.attributes.normal;
            const normals = [];
    
            for ( let i=0 ; i<normAttrib.count ; i++ ) {
    
                normals.push(
                    new CANNON.Vec3(
                        normAttrib.getX( i ),
                        normAttrib.getY( i ),
                        normAttrib.getZ( i )
                    )
                );
    
            }
    
            //
    
            const index = obj.geometry.index;
            const faces = [];
    
            for ( let i=0 ; i<index.count ; i+=3 ) {
    
                faces.push([
                    index.array[ i ],
                    index.array[ i + 1 ],
                    index.array[ i + 2 ]
                ]);
    
            }
    
            // Construct polyhedron
    
            const hullPart = new CANNON.ConvexPolyhedron({ vertices, faces, normals })
    
            // Add to compound
    
            hullBody.addShape( hullPart );
    
        }
    
    });

    return hullBody;
}