# Anime Animation Engine - Architecture & Implementation Plan

## Executive Summary

Build a **lightweight, math-driven, web-based anime animation engine** that generates complex multi-character scenes from text prompts. The engine prioritizes:
- **Procedural shape generation** (not pixel-based diffusion)
- **Vector/SVG rendering** (scalable, math-defined)
- **Skeletal animation** (pose-driven, not frame-by-frame)
- **Generic entity system** (dog, human, alien, props—all treated equally)
- **LLM integration** (minimal cost: prompts + motion descriptions only)

---

## Architecture Overview

### Layered Stack

```
┌─────────────────────────────────────────────────────┐
│              FRONTEND (Web Browser)                 │
│  React + Paper.js/Two.js + Pixi.js                │
│  (UI, canvas rendering, real-time animation)      │
└──────────────────┬──────────────────────────────────┘
                   │ WebSocket / REST API
┌──────────────────▼──────────────────────────────────┐
│            BACKEND (Python/Node.js)                │
│  ┌─────────────────────────────────────┐           │
│  │ Scene Orchestration Manager         │           │
│  │  - Parse LLM output → Scene JSON    │           │
│  │  - Spawn entities procedurally      │           │
│  │  - Coordinate animation pipeline    │           │
│  └─────────────────────────────────────┘           │
│  ┌─────────────────────────────────────┐           │
│  │ LLM Integration (Claude/GPT)        │           │
│  │  - Scene description generation     │           │
│  │  - Motion sequence synthesis        │           │
│  │  - Character attribute extraction   │           │
│  └─────────────────────────────────────┘           │
│  ┌─────────────────────────────────────┐           │
│  │ Procedural Generation Engines       │           │
│  │  - Character shape generation       │           │
│  │  - Background/prop generation       │           │
│  │  - Skeleton type routing            │           │
│  └─────────────────────────────────────┘           │
│  ┌─────────────────────────────────────┐           │
│  │ Motion Synthesis Engine             │           │
│  │  - Procedural walk/idle cycles      │           │
│  │  - LLM action → keyframe mapping    │           │
│  │  - Catmull-Rom interpolation        │           │
│  └─────────────────────────────────────┘           │
│  ┌─────────────────────────────────────┐           │
│  │ Video Encoding (FFmpeg)             │           │
│  │  - Frame sequence → MP4/WebM        │           │
│  └─────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Entity-Component System (Generic Scene Graph)

**File Structure:**
```
src/
├── core/
│   ├── Entity.ts          # Generic entity class (not humanoid-specific)
│   ├── Component.ts       # Component interface
│   ├── Scene.ts           # Scene graph & transform hierarchy
│   ├── Transform.ts       # Position, rotation, scale with parent inheritance
│   └── Camera.ts          # Viewport & projection
```

**Key Concept:**
- Every object in the scene is an **Entity** (character, prop, background, light)
- Entities hold **Components** (Renderable, Skeleton, Animator, Physics, etc.)
- Entities form a **tree hierarchy** with parent/child relationships
- Transform propagation flows from root → children (world space calculation)

**Entity Types:**
```typescript
type EntityType = "character" | "prop" | "background" | "effect" | "light"

// Example: Dog character
{
  id: "hero_dog",
  type: "character",
  components: {
    "renderable": CharacterRenderable { shapeDefinition: [...] },
    "skeleton": SkeletonComponent { type: "quadruped", bones: [...] },
    "animator": AnimatorComponent { currentMotion: [...] }
  },
  transform: { position: [100, 100], rotation: 0, scale: [1, 1] },
  parent: null,
  children: []
}
```

---

### 2. Procedural Shape Generation

**File Structure:**
```
src/
├── generation/
│   ├── ShapeFactory.ts           # Route by shape type
│   ├── characters/
│   │   ├── HumanShapeGen.ts      # Human body procedural
│   │   ├── AnimalShapeGen.ts     # Dog, cat, bird, etc.
│   │   ├── AlienShapeGen.ts      # Non-realistic creatures
│   │   └── ShapeUtils.ts         # Bezier curves, ellipses, polygons
│   ├── props/
│   │   ├── PropShapeGen.ts       # Trees, rocks, furniture, etc.
│   │   └── PropLibrary.ts        # Pre-built shape templates
│   └── backgrounds/
│       ├── BackgroundGen.ts      # Room, outdoor, abstract
│       └── BackgroundLibrary.ts  # Scene templates
```

**Generation Flow:**
```
LLM Output: { type: "dog", color: "brown", size: "medium" }
    ↓
ShapeFactory.generate(params)
    ↓
AnimalShapeGen.generateDog(params)
    ↓
SVG Path Array: [
  { type: "ellipse", cx: 100, cy: 100, rx: 80, ry: 60, fill: "#8B4513" },  // body
  { type: "circle", cx: 100, cy: 50, rx: 40, fill: "#8B4513" },             // head
  { type: "path", d: "M 80 80 Q 70 120, 60 150", stroke: "#8B4513" },        // tail
  ...
]
```

**Key Libraries (Public Repos):**
- **WaifuGen** (reference for parametric face decomposition)
- **Paper.js** (SVG path manipulation, Bezier curves)

---

### 3. Skeleton System (Type-Agnostic)

**File Structure:**
```
src/
├── skeleton/
│   ├── SkeletonFactory.ts        # Route by skeleton type
│   ├── Humanoid.ts               # 2-legged skeleton hierarchy
│   ├── Quadruped.ts              # 4-legged skeleton hierarchy
│   ├── Custom.ts                 # User-defined bones
│   ├── Bone.ts                   # Single bone definition
│   └── BoneChain.ts              # FK/IK solver utilities
```

**Skeleton Structure:**
```typescript
{
  type: "quadruped",
  bones: {
    root: { pos: [0, 0], parent: null, length: 0 },
    torso: { pos: [0, 40], parent: "root", length: 60 },
    head: { pos: [0, 50], parent: "torso", length: 40 },
    frontLeftLeg: { pos: [-25, 60], parent: "torso", length: 80 },
    frontRightLeg: { pos: [25, 60], parent: "torso", length: 80 },
    backLeftLeg: { pos: [-25, 0], parent: "root", length: 80 },
    backRightLeg: { pos: [25, 0], parent: "root", length: 80 },
    tail: { pos: [0, -40], parent: "root", length: 100 }
  }
}
```

**World Transform Computation:**
```
For each bone: world_position = parent_world_pos + rotate(local_pos, parent_angle)
             world_angle = parent_angle + local_angle
```

---

### 4. Motion Synthesis Engine

**File Structure:**
```
src/
├── motion/
│   ├── MotionSynthesizer.ts      # Main orchestrator
│   ├── ProceduralMotions.ts      # Walk, idle, run, jump, sit
│   ├── KeyframeGenerator.ts      # Convert LLM action → keyframes
│   ├── Interpolation.ts          # Catmull-Rom, linear lerp
│   ├── MotionSequencer.ts        # Chain multiple motions
│   └── AnimePhysics.ts           # Squash/stretch, overshoot timing
```

**Motion Flow:**
```
LLM Output: "walk forward 3 steps, raise right hand, turn head left"
    ↓
MotionSynthesizer.synthesize(actionDescription)
    ↓
Split into keyframe actions: ["walk", "raise_hand", "head_turn"]
    ↓
ProceduralMotions.generateWalkCycle(3, speed=1.0)
  → [Frame0, Frame1, ..., Frame23] (24 frames for 3 steps)
  
ProceduralMotions.generateGesture("raise_right_hand")
  → [Frame0, Frame1, ..., Frame12]
  
ProceduralMotions.generateHeadTurn("left", angle=45°)
  → [Frame0, Frame1, ..., Frame6]
    ↓
Blend/sequence these together
    ↓
MotionSequence: [
  { frame: 0-23, motion: walk },
  { frame: 12-24, motion: raise_hand, blendWeight: 0.5 },
  { frame: 15-22, motion: head_turn, blendWeight: 0.7 }
]
    ↓
For each frame t: interpolate(motion[t-1], motion[t], blend_t)
    ↓
Output: [SkeletonPose0, SkeletonPose1, ..., SkeletonPose100]
```

**Procedural Motion Math:**
```typescript
function generateWalkCycle(frames: number, speed: number): Frame[] {
  const result = [];
  for (let i = 0; i < frames; i++) {
    const t = i / frames; // 0 to 1
    
    // Sinusoidal leg swings
    const leftLegAngle = -Math.PI/4 + 0.8 * Math.sin(t * Math.PI * 2);
    const rightLegAngle = -Math.PI/4 - 0.8 * Math.sin(t * Math.PI * 2);
    
    // Body sway
    const torsoAngle = 0.1 * Math.sin(t * Math.PI * 2);
    
    // Forward movement
    const forwardDist = t * speed * 100;
    
    result.push({
      bones: {
        leftLeg: { angle: leftLegAngle },
        rightLeg: { angle: rightLegAngle },
        torso: { angle: torsoAngle },
        // ...other bones
      },
      rootPosition: [forwardDist, 0]
    });
  }
  return result;
}
```

---

### 5. Rendering Pipeline

**File Structure:**
```
src/
├── rendering/
│   ├── Renderer.ts               # Abstract renderer interface
│   ├── PixiRenderer.ts           # Pixi.js WebGL backend
│   ├── CanvasRenderer.ts         # Canvas 2D fallback
│   ├── SVGRenderer.ts            # Pure SVG rendering
│   ├── RenderPass.ts             # Layered rendering (bg → chars → fg)
│   └── Effects.ts                # Filters, shadows, glows
```

**Rendering Flow:**
```
For each frame:
  1. Update scene hierarchy (world transforms)
  2. Update animations (motion interpolation)
  3. For each entity in render order:
     a. Get Renderable component
     b. Get current skeleton pose (if character)
     c. Transform shape paths by skeleton
     d. Draw to canvas
  4. Encode frame to video buffer
```

**HTML/WebGL Setup:**
```html
<canvas id="anime-canvas" width="1280" height="720"></canvas>

<script>
  const app = new PIXI.Application({ 
    view: document.getElementById("anime-canvas"),
    width: 1280, 
    height: 720 
  });
  
  // Scene graph in PIXI
  const sceneRoot = new PIXI.Container();
  app.stage.addChild(sceneRoot);
  
  // Render loop
  app.ticker.add(() => {
    scene.updateHierarchy();
    scene.render(pixiRenderer);
  });
</script>
```

---

### 6. LLM Integration (Minimal Cost)

**File Structure:**
```
src/
├── llm/
│   ├── LLMClient.ts              # Claude/GPT API wrapper
│   ├── PromptEngine.ts           # Prompt engineering
│   ├── ResponseParser.ts         # JSON extraction
│   └── CostTracker.ts            # Monitor API spend
```

**Usage Pattern (Minimal Calls):**

**Call 1: Scene Description** (~$0.01)
```
Input:
  "A dog runs through a forest, chasing a butterfly"

LLM Output (JSON):
{
  "background": {
    "type": "outdoor",
    "elements": ["trees", "grass", "sky"],
    "timeOfDay": "afternoon",
    "weather": "sunny"
  },
  "characters": [
    {
      "id": "hero",
      "species": "dog",
      "appearance": { "breed": "golden_retriever", "color": "#D4A574", "mood": "playful" },
      "position": [100, 400],
      "initialPose": "standing"
    },
    {
      "id": "butterfly",
      "species": "butterfly",
      "appearance": { "colorPattern": "monarch", "wingspan": "small" },
      "position": [400, 200]
    }
  ],
  "objects": []
}
```

**Call 2: Motion Sequence** (~$0.01)
```
Input:
  "Describe the motion sequence for a dog chasing a butterfly through trees for 10 seconds"

LLM Output (JSON):
{
  "hero_dog": {
    "motionSequence": [
      { "time": "0-2s", "action": "stand up from sitting", "speed": "medium" },
      { "time": "2-8s", "action": "run forward with acceleration", "speed": "fast" },
      { "time": "8-9s", "action": "jump to catch butterfly", "height": "high" },
      { "time": "9-10s", "action": "land and look around", "emotion": "confused" }
    ],
    "cameraFollow": "medium_distance_behind"
  },
  "butterfly": {
    "motionSequence": [
      { "time": "0-10s", "action": "flutter and dodge", "pattern": "erratic", "height": "varying" }
    ]
  }
}
```

**All else is code-based:** No LLM calls for:
- Character shape generation (procedural)
- Background generation (procedural)
- Skeleton setup (templated by type)
- Motion interpolation (math)
- Rendering (deterministic)

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Entity-Component-System (ECS) foundation
- [ ] Scene graph with transform hierarchy
- [ ] Generic component interfaces
- [ ] Unit tests for transform propagation
- [ ] Scene JSON schema documentation

**Deliverable:** Basic scene with 3+ entities, proper parent/child transforms

### Phase 2: Shape Generation (Week 2-3)
- [ ] SVG path primitives (ellipse, rectangle, polygon, bezier)
- [ ] Character shape generator (human template)
- [ ] Animal shape generator (dog, cat, bird templates)
- [ ] Prop shape generator (trees, rocks, furniture)
- [ ] Background generator (room, outdoor, abstract)
- [ ] LLM → shape parameter mapping

**Deliverable:** Generate any character/prop from text description

### Phase 3: Skeleton & Animation (Week 3-4)
- [ ] Skeleton factory (humanoid, quadruped, custom)
- [ ] Bone hierarchy and world transform computation
- [ ] Basic FK (forward kinematics) solver
- [ ] Procedural motion generation (walk, idle, run, jump)
- [ ] Keyframe interpolation (Catmull-Rom)
- [ ] Motion sequencing and blending

**Deliverable:** Animate dog walking, human dancing, arbitrary skeleton

### Phase 4: Rendering & Integration (Week 4-5)
- [ ] Pixi.js integration
- [ ] Shape-to-sprite conversion
- [ ] Skeleton-driven shape deformation
- [ ] Layered rendering (background → characters → foreground)
- [ ] Camera system and viewport
- [ ] Real-time animation playback

**Deliverable:** Multi-entity scene with smooth skeletal animation

### Phase 5: LLM Integration & Video Export (Week 5-6)
- [ ] Claude API integration
- [ ] Scene description parsing
- [ ] Motion sequence parsing
- [ ] FFmpeg video encoding
- [ ] Web UI (prompt input → video output)
- [ ] Cost tracking dashboard

**Deliverable:** End-to-end: text prompt → animated MP4

### Phase 6: Polish & Optimization (Week 6-7)
- [ ] Performance profiling
- [ ] Frame interpolation (RIFE optional)
- [ ] Asset caching
- [ ] Error handling & fallbacks
- [ ] Documentation & examples

**Deliverable:** Production-ready demo

---

## Key Public Repositories to Reference

| Component | Repo | What to Use |
|-----------|------|-----------|
| **Shape Generation** | WaifuGen | Parametric face decomposition |
| **Vector Manipulation** | Paper.js | SVG path operations, Bezier curves |
| **2D Rendering** | Pixi.js | Fast WebGL 2D engine |
| **Scene Graph** | Three.js | Transform hierarchy pattern |
| **ECS Pattern** | parabola.js | Entity manager, component system |
| **Interpolation Math** | p5.js | Catmull-Rom, easing functions |
| **Godot** (inspiration) | Godot Engine | Node-based scene composition |
| **Motion Blending** | Three.js AnimationMixer | Keyframe interpolation |

---

## Technology Stack

### Frontend
```
React 18+                 # UI framework
TypeScript                # Type safety
Paper.js or Two.js        # Vector graphics
Pixi.js 8+                # 2D WebGL rendering
WebSocket / REST API      # Backend communication
```

### Backend
```
Node.js (TypeScript) OR Python (FastAPI)
Claude/GPT API            # Scene & motion descriptions
FFmpeg                    # Video encoding
SQLite / PostgreSQL       # Job queue, history
Docker                    # Containerization
```

### Data Formats
```
JSON                      # Scene descriptions, motion sequences
SVG                       # Shape definitions
PNG/JPG                   # Frame output (optional)
MP4/WebM                  # Final video
```

---

## Scene JSON Schema

```typescript
interface Scene {
  id: string;
  duration: number; // seconds
  canvas: { width: number; height: number };
  
  background: {
    type: "outdoor" | "room" | "abstract";
    color?: string;
    elements?: string[];
  };
  
  entities: Entity[];
  camera: {
    position: [number, number];
    zoom: number;
    followTarget?: string; // entity id
  };
}

interface Entity {
  id: string;
  type: "character" | "prop" | "background" | "effect";
  
  // Shape definition
  shape?: {
    type: string; // "dog", "tree", "room", etc.
    params: Record<string, any>; // appearance params
  };
  
  // Skeleton (for characters)
  skeleton?: {
    type: "humanoid" | "quadruped" | "custom";
    bones?: Bone[];
  };
  
  // Transform
  transform: {
    position: [number, number];
    rotation: number;
    scale: [number, number];
  };
  
  // Parent/child relationships
  parent?: string; // parent entity id
  children?: string[]; // child entity ids
  
  // Animation
  motion?: {
    sequence: MotionFrame[];
    playbackSpeed: number;
    loop: boolean;
  };
}

interface MotionFrame {
  time: number; // seconds
  bones: Record<string, { angle: number }>; // per-bone rotations
  rootPosition: [number, number]; // root translation
}
```

---

## Example Workflow

### Input
```
"A brown dog chases a red ball across a sunny garden. The dog jumps to catch the ball at the end."
```

### Step 1: LLM Scene Description
```json
{
  "background": { "type": "outdoor", "color": "#87CEEB", "elements": ["grass", "trees", "sky"] },
  "characters": [
    { "id": "dog", "species": "dog", "appearance": { "color": "#8B4513", "mood": "playful" }, "position": [100, 300] }
  ],
  "objects": [
    { "id": "ball", "type": "prop", "shape": "sphere", "params": { "color": "#FF0000", "radius": 10 }, "position": [300, 300] }
  ]
}
```

### Step 2: Scene Creation (Code)
```
1. Create background entity → generate outdoor landscape SVG
2. Create dog entity → generate dog shape SVG + quadruped skeleton
3. Create ball entity → generate red sphere shape
4. Add all to scene graph
```

### Step 3: LLM Motion Description
```json
{
  "dog": {
    "motionSequence": [
      { "time": "0-3s", "action": "run forward with increasing speed", "distance": 200 },
      { "time": "3-4s", "action": "jump to catch ball", "height": 150 },
      { "time": "4-5s", "action": "land and play with ball", "emotion": "excited" }
    ]
  },
  "ball": {
    "motionSequence": [
      { "time": "0-3.5s", "action": "roll forward", "distance": 200 },
      { "time": "3.5-4s", "action": "fly upward", "arc": "high" },
      { "time": "4-5s", "action": "fall to ground", "bounce": true }
    ]
  }
}
```

### Step 4: Motion Synthesis (Code)
```
1. Generate dog walk cycle (3s)
2. Generate dog jump motion (1s, triggered at frame 72)
3. Generate ball rolling physics
4. Blend all together
5. Interpolate all keyframes to 24fps
```

### Step 5: Render & Export
```
1. For each frame (0-120):
   a. Update scene transforms (world space)
   b. Update animator states
   c. Get current skeleton pose
   d. Transform dog shape by skeleton
   e. Render to canvas
   f. Record frame
2. Encode frame sequence to MP4 via FFmpeg
```

### Output
```
anime_scene_001.mp4 (5 seconds, 1280x720, 24fps)
```

---

## Success Criteria

✅ **MVP (Minimum Viable Product)**
- [ ] Render static scene with 3+ entities
- [ ] Procedurally generate human + dog shapes
- [ ] Animate single character with procedural walk cycle
- [ ] Export to MP4

✅ **v1.0 (Feature Complete)**
- [ ] LLM-driven scene generation
- [ ] Multi-character animation
- [ ] Motion blending (walk → jump → idle)
- [ ] Camera following
- [ ] Customizable props and backgrounds
- [ ] <$0.05 per scene generation

✅ **Future (Nice to Have)**
- [ ] Face animation (blinking, talking, expressions)
- [ ] Clothing/costume system
- [ ] Physics-based interactions
- [ ] Real-time web viewer with playback controls
- [ ] Character library and versioning
- [ ] Batch scene generation

---

## Open Questions & Next Steps

1. **Should we support voice-driven animation?**
   - Add speech synthesis (TTS) + lip sync?
   - LLM generates dialogue → TTS → subtitle + mouth shapes

2. **Frame interpolation (RIFE)?**
   - Optional post-processing for ultra-smooth motion
   - Trade: +30% rendering time for better motion quality

3. **3D vs. 2D Camera?**
   - Current plan: orthographic 2D (simpler, lighter)
   - Future: perspective camera with depth layering

4. **Character customization persistence?**
   - Save character presets (name, skeleton type, shape params)?
   - Character library for scene reuse?

5. **Real-time collaborative editing?**
   - Multiple users editing same scene simultaneously?
   - WebSocket for live updates?

---

## File Structure (Final)

```
anime-engine/
├── PLAN.md                          (this file)
├── README.md
├── package.json / pyproject.toml
│
├── src/
│   ├── core/
│   │   ├── Entity.ts
│   │   ├── Component.ts
│   │   ├── Scene.ts
│   │   ├── Transform.ts
│   │   └── Camera.ts
│   │
│   ├── generation/
│   │   ├── ShapeFactory.ts
│   │   ├── characters/
│   │   ├── props/
│   │   └── backgrounds/
│   │
│   ├── skeleton/
│   │   ├── SkeletonFactory.ts
│   │   ├── Humanoid.ts
│   │   ├── Quadruped.ts
│   │   └── Bone.ts
│   │
│   ├── motion/
│   │   ├── MotionSynthesizer.ts
│   │   ├── ProceduralMotions.ts
│   │   ├── Interpolation.ts
│   │   └── MotionSequencer.ts
│   │
│   ├── rendering/
│   │   ├── Renderer.ts
│   │   ├── PixiRenderer.ts
│   │   ├── RenderPass.ts
│   │   └── Effects.ts
│   │
│   ├── llm/
│   │   ├── LLMClient.ts
│   │   ├── PromptEngine.ts
│   │   └── ResponseParser.ts
│   │
│   ├── video/
│   │   ├── VideoEncoder.ts
│   │   └── FrameBuffer.ts
│   │
│   └── main.ts (orchestration entry point)
│
├── frontend/
│   ├── index.html
│   ├── app.tsx
│   ├── components/
│   │   ├── SceneCanvas.tsx
│   │   ├── PromptInput.tsx
│   │   ├── VideoPreview.tsx
│   │   └── ControlPanel.tsx
│   └── styles/
│
├── backend/
│   ├── server.ts (Node.js + Express)
│   ├── routes/
│   │   ├── generate.ts
│   │   ├── animate.ts
│   │   └── export.ts
│   ├── services/
│   │   ├── SceneService.ts
│   │   ├── LLMService.ts
│   │   └── VideoService.ts
│   └── queue/
│       └── JobQueue.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── examples/
│
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── SHADER_GUIDE.md
│   └── EXAMPLES.md
│
└── docker-compose.yml
```

---

## References & Inspiration

- **Godot Engine**: Node-based scene system architecture
- **Three.js**: Transform hierarchy and scene graph patterns
- **Paper.js**: Vector graphics and Bezier manipulation
- **DragonBonesJS**: Skeletal animation runtime
- **Pixi.js**: WebGL 2D rendering performance
- **AnimateAnyone**: Image-to-video consistency techniques
- **RIFE**: Frame interpolation mathematics

---

## Conclusion

This plan provides a **clear, scalable architecture** for building a production-ready anime animation engine. The key innovations are:

1. **Generic entity system** - supports any character/object type
2. **Math-driven shapes** - SVG/procedural, not pixel-based diffusion
3. **Skeletal animation** - smooth, efficient, extensible
4. **Minimal LLM usage** - just scene description & motion, ~$0.02 per generation
5. **Web-native rendering** - Pixi.js for speed, Paper.js for flexibility

**Timeline:** 6-7 weeks to production-ready MVP with end-to-end demo.
