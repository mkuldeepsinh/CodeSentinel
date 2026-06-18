# Role & Objective
You are an Expert Frontend Architect specializing in Next.js (App Router), Tailwind CSS, and high-fidelity web-based IDEs. Your objective is to build a production-ready, highly scannable, and modular IDE web interface from scratch using Next.js.

The design language must heavily reference [Zed Editor](https://zed.dev/) for its pristine, high-performance layout, enhanced with modern web UI trends like **glassmorphism**.

# Next.js Architectural Blueprint
- **Framework:** Next.js (App Router structure).
- **Component Strategy:** Maximize performance by keeping layout containers clean. Use `'use client'` strictly for interactive UI components (File Tree, Code Editor panel, and CodeSentinel CLI) while maintaining a clean, modular structure under a dedicated directory like `app/ide/` or `components/ide/`.
- **Styling & Fonts:** Use Tailwind CSS for all layout and styling. Utilize `next/font` to load a crisp sans-serif font (e.g., Inter) for the UI elements, and a clean monospace font (e.g., JetBrains Mono or Fira Code) for the code editor and terminal areas.

# IDE Structural Anatomy (Layout Requirements)
The workspace must be built using a strict CSS Grid/Flexbox shell divided into 5 distinct layout zones:

1. **Activity Bar (Far Left, vertical):** Thin vertical bar with navigation icons (Explorer, Search, Source Control, Settings).
2. **Side Bar (Left, collapsible):** The Project Explorer containing a dense, clean file tree with folder/file hierarchies.
3. **Editor Group (Center, main area):** - Top: File tabs with active/inactive states, close buttons, and unsaved indicators.
   - Sub-top: Breadcrumb trail showing the current file path.
   - Body: The code editing area featuring a line-number gutter and full syntax highlighting.
4. **Bottom Panel (CodeSentinel CLI & Terminal):** A dedicated, resizable panel spanning the bottom of the Editor Group. This is the command center for the `CodeSentinel` agent.
5. **Status Bar (Bottom-most, horizontal):** Thin informative bar showing Git branch, error counters, cursor position (Ln, Col), and Language mode.

# Styling, Theme & UX Directives
- **Theme Definition:** Implement a premium dark theme (matching aesthetics like "Tokyo Night" or "One Dark Pro"). The code editing area MUST display vivid, accurate syntax highlighting colors for keywords, strings, functions, and variables immediately upon rendering code.
- **Glassmorphism:** Apply subtle frosted glass effects (`backdrop-blur-md`, semi-transparent background opacities, and ultra-thin `border-white/10` or `border-neutral-800` lines) to floating panels, active tabs, and the CLI terminal to establish a premium, spatial feel.
- **Scroll Behavior:** Ensure independent overflow scrolling so that the code workspace, file tree, and CLI log can scroll separately without breaking the master layout.

# Strict Execution Protocol (Multi-Step Rule)
You MUST execute this project in isolated, sequential phases. **Do not attempt to generate the entire Next.js application framework all at once.**

For every phase, follow this exact loop:
1. Write the explicit code for the specific components or configurations required in that phase.
2. Provide precise instructions on how to run, view, and verify this update locally.
3. **STOP.** Explicitly ask for my review and consent to proceed. **Do not move to the next phase until I explicitly reply with "Proceed".**

---

### Phase 1: Global Setup & Next.js Layout Shell
- Configure Next.js font optimization (Sans-serif and Monospace setup) and setup global Tailwind CSS variables for the dark theme.
- Build the core master layout structure inside the Next.js page directory, properly arranging the 5 structural zones.
- Implement the baseline glassmorphic styling context across the shell containers.
- *Stop and wait for review.*

### Phase 2: Activity Bar & Project Explorer Sidebar
- Build the vertical Activity Bar component with hover/active state icons.
- Build the Left Sidebar File Tree component. Ensure support for folders, nested items, and dense, highly readable typography mimicking native desktop applications.
- *Stop and wait for review.*

### Phase 3: Workspace Tabs & Syntax-Highlighted Editor
- Build the Client-side Editor Tabs row component (handling active indicators and closing events).
- Implement the core Code Editor layout containing a clean line-number gutter.
- Integrate a robust client-side rendering approach (using standard token styling or a lightweight library compatible with Next.js) to apply an explicit, professional code syntax coloring theme to displayed source code.
- *Stop and wait for review.*

### Phase 4: CodeSentinel CLI Bottom Panel
- Construct the Bottom Panel layout featuring functional toggles (e.g., Terminal, Output, CodeSentinel).
- Design the **CodeSentinel** pane to emulate an advanced command-line terminal environment.
- Upper area: A scrollable, project-scoped **Chat History** and interactive chat timeline window.
- Lower area: A persistent command prompt input bar starting with a distinct terminal prompt prefix (`$ >_ `) where user inputs are entered.
- Differentiate user commands visually from agent responses. Agent output cards must natively accommodate Markdown structures and beautifully format embedded code blocks.
- *Stop and wait for review.*

### Phase 5: Status Bar & Layout Integration Polish
- Implement the bottom Status Bar displaying UI state information (Git branch, line positions).
- Audit all Flexbox layouts, layout boundaries, and scrolling rules to ensure the entire workspace stays perfectly locked to the viewport dimensions without breaking or creating global page scrollbars.
- *Stop and wait for review.*

# Initialization
Acknowledge these Next.js specific layout guidelines, confirm your adherence to the strict "Stop and Wait" validation loop, and output the codebase initialization files for **Phase 1** immediately.