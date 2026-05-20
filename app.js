/* ================================================================
   PRODUCTIVITY HUB — app.js
   ================================================================
   HOW THIS FILE IS ORGANIZED:
   1. DOM element references
   2. Application state (the tasks array)
   3. localStorage functions (save / load)
   4. Core functions (render a card, update progress)
   5. Event listeners (add, delete, complete, navbar, scroll)
   6. Page load — restore tasks from localStorage

   THE GOLDEN RULE OF THIS FILE:
   The tasks[] array is ALWAYS the source of truth.
   The DOM is just a visual representation of that array.
   Every action (add / complete / delete) must:
      STEP 1 → update tasks[]
      STEP 2 → save to localStorage
      STEP 3 → update the DOM
   In that order. Always.
================================================================ */


/* ================================================================
   1. DOM ELEMENT REFERENCES
================================================================ */

const navbar          = document.getElementById("navbar");
const startBtn        = document.getElementById("start-btn");
const todoLink        = document.getElementById("todo-link");
const plannerLink     = document.getElementById("planner-link");
const menuToggle      = document.getElementById("menu-toggle");
const navbarLinks     = document.querySelector(".nav-links");

const addBtn          = document.getElementById("add-task-btn");
const taskTitleInput  = document.getElementById("task-title");
const taskNotesInput  = document.getElementById("task-notes");
const taskList        = document.getElementById("task-list");
const emptyState      = document.getElementById("empty-state");

const homeSection     = document.getElementById("home");

const progressText    = document.getElementById("progress-text");
const progressFill    = document.getElementById("progress-fill");
const progressMessage = document.getElementById("progress-message");


/* ================================================================
   2. APPLICATION STATE
   ================================================================
   tasks[] is a JavaScript array of objects.
   Each object represents one task and looks like this:

   {
      id:        "task_1718000000000",   ← unique ID (timestamp-based)
      title:     "Study DSA",
      notes:     "Do binary search",
      important: true,
      starred:   false,
      completed: false
   }

   WHY a unique ID?
   When the user clicks Delete on a card, we need to know WHICH
   object in the array to remove. We do this by storing the ID
   on the DOM card using a data attribute (data-id), then using
   that to find and remove the matching object from tasks[].

   Without an ID, you're flying blind. Don't fly blind.
================================================================ */

let tasks = [];


/* ================================================================
   3. LOCALSTORAGE FUNCTIONS
   ================================================================
   localStorage is a KEY-VALUE store built into every browser.
   It survives page refreshes and even closing the browser tab.
   It only stores STRINGS — no arrays, no objects.
   So we convert with JSON.stringify() before saving,
   and JSON.parse() after loading.
================================================================ */

/* ---- saveTasks ----
   Converts tasks[] to a JSON string and saves it to localStorage.
   Called after every single change to tasks[]. */
function saveTasks() {
    // JSON.stringify turns [ {title: "x"}, ... ] into '[{"title":"x"},...]'
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

/* ---- loadTasks ----
   Reads the JSON string from localStorage and converts it back
   into a real JavaScript array.
   Returns the saved array, or an empty array if nothing is saved yet.

   IMPORTANT: also sanitizes any tasks that were saved by older broken
   code (before this version) that didn't include a unique id field.
   Without this, those tasks cause silent failures on delete/complete
   because card.dataset.id is "undefined" and tasks.find() returns nothing. */
function loadTasks() {
    // localStorage.getItem returns null if the key doesn't exist yet
    const saved = localStorage.getItem("tasks");

    if (saved) {
        // JSON.parse turns '[{"title":"x"},...]' back into [ {title: "x"}, ... ]
        const parsed = JSON.parse(saved);

        // Sanitize: give any task a fresh id if it's missing one.
        // This handles tasks saved by previous broken versions of the code.
        // Math.random() gives a fallback unique enough for this purpose.
        const sanitized = parsed.map(function(task) {
            if (!task.id) {
                task.id = "task_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
            }
            return task;
        });

        // Save the sanitized array back immediately so corrupted data
        // is never read again after this first load.
        localStorage.setItem("tasks", JSON.stringify(sanitized));

        return sanitized;
    }

    // First-ever visit: no saved data, start with an empty array
    return [];
}


/* ================================================================
   4. CORE FUNCTIONS
================================================================ */

/* ---- createTaskCard ----
   Takes ONE task object from tasks[] and builds its DOM card.
   Returns the card element WITHOUT adding it to the page yet.

   WHY return it instead of appending directly?
   Because we call this function from two places:
   1. When the user ADDS a new task (we want the slide-in animation)
   2. When the PAGE LOADS and restores saved tasks (no animation)
   Returning the element lets the caller decide what to do with it.
================================================================ */
function createTaskCard(taskObj) {

    // Create the card container div
    const card = document.createElement("div");
    card.classList.add("task-card");

    // THIS IS THE KEY PIECE: store the task's unique ID on the DOM element.
    // data-id is a "data attribute" — a custom attribute you can put on
    // any HTML element to store arbitrary information.
    // Later, when Delete or Complete is clicked, we read card.dataset.id
    // to find which task in tasks[] this card belongs to.
    card.dataset.id = taskObj.id;

    // If this task was already completed when saved, add the class immediately
    // so CSS applies the faded styling on page load
    if (taskObj.completed) {
        card.classList.add("completed-task");
    }

    // Build the inner HTML of the card
    // The complete button text and class differ based on completion state
    card.innerHTML = `
        <div class="task-top">
            <h3>${taskObj.title}</h3>
            <div class="task-tags">
                ${taskObj.important ? '<span class="important-tag">Important</span>' : ""}
                ${taskObj.starred   ? '<span class="star-tag">⭐</span>' : ""}
            </div>
        </div>

        <p>${taskObj.notes}</p>

        <div class="task-buttons">
            ${taskObj.completed
                // Already done: show a disabled "Completed" button
                ? '<button class="completed-btn" disabled>Completed</button>'
                // Not done yet: show the active "Complete" button
                : '<button class="complete-btn">Complete</button>'
            }
            <button class="delete-btn">Delete</button>
        </div>
    `;

    return card;
}


/* ---- updateProgress ----
   Reads tasks[] directly (not the DOM) to calculate stats.
   Updates the progress bar, count text, and motivational message.
   Also shows/hides the empty state.

   WHY read from tasks[] instead of querySelectorAll?
   Because tasks[] is always up to date. The DOM might be mid-animation
   (card is visually still there but logically already deleted).
   Reading the array gives us accurate numbers instantly.
================================================================ */
function updateProgress() {

    const total     = tasks.length;
    const completed = tasks.filter(function(t) { return t.completed; }).length;
    // Array.filter() returns a new array containing only items
    // where the callback returns true.
    // t.completed is true for completed tasks, so we count those.

    // Update the "Completed X / Y Tasks" text
    progressText.textContent = `Completed ${completed} / ${total} Tasks`;

    // Calculate percentage (guard against dividing by zero when no tasks exist)
    const percent = total === 0 ? 0 : (completed / total) * 100;

    // Update the green bar width — CSS transition handles the smooth animation
    progressFill.style.width = `${percent}%`;

    // Update motivational message
    if (percent === 100 && total > 0) {
        progressMessage.textContent = "Perfect. Everything completed today.";
    } else if (percent >= 50) {
        progressMessage.textContent = "Great progress. Keep pushing forward.";
    } else {
        progressMessage.textContent = "Let's go. You can do it!";
    }

    // Show the empty state placeholder only when there are zero tasks
    emptyState.style.display = total === 0 ? "flex" : "none";
}


/* ================================================================
   5. EVENT LISTENERS
================================================================ */

/* ---- "Get Started" Button ---- */
startBtn.addEventListener("click", function () {
    todoLink.classList.add("nav-highlight");
    plannerLink.classList.add("nav-highlight");
    setTimeout(function () {
        todoLink.classList.remove("nav-highlight");
        plannerLink.classList.remove("nav-highlight");
    }, 1000);
});

/* ---- Hamburger Menu Toggle ---- */
menuToggle.addEventListener("click", function () {
    const isOpen = navbar.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
});

/* ---- Close Mobile Menu on Link Click ---- */
navbarLinks.addEventListener("click", function (event) {
    if (event.target.tagName === "A" && window.innerWidth <= 768) {
        navbar.classList.remove("menu-open");
        menuToggle.setAttribute("aria-expanded", "false");
    }
});

/* ---- Add Task ----
   Order of operations here is CRITICAL:
   1. Validate input first — reject early if empty
   2. Build the task object
   3. Push to tasks[]
   4. Save to localStorage
   5. Build the DOM card
   6. Animate it in
   7. Reset input fields
================================================================ */
addBtn.addEventListener("click", function () {

    const title = taskTitleInput.value.trim();
    const notes = taskNotesInput.value.trim();
    // .trim() removes leading/trailing whitespace
    // "   " becomes "" which our check below catches

    // VALIDATE FIRST — before touching the array
    // Your original code pushed to the array first, THEN checked.
    // That meant garbage data was being saved. Not anymore.
    if (title === "") {
        alert("Task cannot be empty");
        return;
    }

    // Build the task data object.
    // Date.now() returns the current timestamp in milliseconds.
    // Using it as an ID guarantees uniqueness — no two tasks
    // can be created at the exact same millisecond.
    const newTask = {
        id:        "task_" + Date.now(),
        title:     title,
        notes:     notes,
        important: document.getElementById("important-task").checked,
        starred:   document.getElementById("star-task").checked,
        completed: false
    };

    // Step 1: update the array
    tasks.push(newTask);

    // Step 2: persist to localStorage
    saveTasks();

    // Step 3: build the DOM card
    const card = createTaskCard(newTask);

    // Add task-hidden BEFORE inserting into the DOM.
    // This sets opacity:0 and translateY(150px) as the starting state.
    // The browser will see this as the "from" state of the transition.
    card.classList.add("task-hidden");

    // Insert at the top (newest first)
    taskList.prepend(card);

    // Update stats immediately (uses tasks[], so it's already accurate)
    updateProgress();

    // After 150ms, remove task-hidden to trigger the CSS transition.
    // WHY 150ms? We need one browser paint cycle to register the
    // task-hidden state before we remove it. 10ms often isn't enough.
    // 150ms is reliably safe across all browsers.
    setTimeout(function () {
        card.classList.remove("task-hidden");
    }, 150);

    // Reset inputs for the next task
    taskTitleInput.value = "";
    taskNotesInput.value = "";
    document.getElementById("important-task").checked = false;
    document.getElementById("star-task").checked = false;
});


/* ---- Delete + Complete (Event Delegation on #task-list) ----
   One listener on the parent handles clicks for ALL cards,
   including cards added in the future. See comments in original
   file for a full explanation of event delegation. */
taskList.addEventListener("click", function (event) {

    // Find the card that contains the clicked button
    const card = event.target.closest(".task-card");

    // Safety check: if the click wasn't inside any card, do nothing
    if (!card) return;

    // Read the task's unique ID from the card's data attribute
    const taskId = card.dataset.id;

    /* ---- DELETE ---- */
    if (event.target.classList.contains("delete-btn")) {

        // Trigger the slide-out animation
        card.classList.add("task-removing");

        setTimeout(function () {
            // Step 1: remove from tasks[] using filter()
            // filter() keeps all tasks EXCEPT the one with this ID
            tasks = tasks.filter(function(t) { return t.id !== taskId; });

            // Step 2: persist the updated array
            saveTasks();

            // Step 3: remove from DOM
            card.remove();

            // Step 4: refresh progress (reads from tasks[], now accurate)
            updateProgress();
        }, 300); // wait for the animation to finish first
    }

    /* ---- COMPLETE ---- */
    if (event.target.classList.contains("complete-btn")) {

        // Guard: already completed — should never reach here
        // because we replace the button, but defensive coding is good
        if (card.classList.contains("completed-task")) return;

        // Trigger the brief fade+shrink animation
        card.classList.add("task-completing");

        setTimeout(function () {
            // Step 1: find the task in the array and flip its completed flag
            const taskObj = tasks.find(function(t) { return t.id === taskId; });
            // Array.find() returns the FIRST item where the callback returns true.
            // Unlike filter() which returns an array, find() returns the actual object.
            // Since we're modifying the object directly (taskObj.completed = true),
            // the change also applies to the same object inside tasks[].
            // This works because objects in JS are passed by reference, not copied.

            taskObj.completed = true;

            // Step 2: persist
            saveTasks();

            // Step 3: update DOM — move card to bottom of list
            taskList.appendChild(card);

            // Remove animation class now that card is in its final position
            card.classList.remove("task-completing");

            // Apply completed styling
            card.classList.add("completed-task");

            // Swap the Complete button for a disabled Completed button
            const completeBtn = card.querySelector(".complete-btn");
            completeBtn.textContent = "Completed";
            completeBtn.classList.remove("complete-btn");
            completeBtn.classList.add("completed-btn");
            completeBtn.disabled = true;

            // Step 4: refresh progress
            updateProgress();
        }, 300);
    }
});


/* ================================================================
   6. PAGE LOAD — RESTORE SAVED TASKS
   ================================================================
   This runs once when the page first loads.

   It reads saved tasks from localStorage, rebuilds all the cards,
   and renders the correct progress state — so the user sees
   exactly what they left behind before refreshing.

   WHY is this at the BOTTOM?
   All functions (createTaskCard, updateProgress, etc.) and all
   DOM references must be defined before we call them.
   Putting the load logic at the bottom guarantees that.
================================================================ */

// Load tasks from localStorage into the tasks[] array
tasks = loadTasks();

// Rebuild the DOM for each saved task.
// WHY sort before rendering?
// tasks[] order: index 0 = oldest task, last index = newest.
// We want pending tasks at the TOP, completed at the BOTTOM.
// Sorting a copy (slice() makes a copy so tasks[] is untouched) puts
// pending (completed:false = 0) before completed (completed:true = 1).
// Then appendChild in that order fills the list correctly.
const sortedForRender = tasks.slice().sort(function(a, b) {
    return a.completed - b.completed;
    // false (0) - false (0) = 0 → same group, order preserved
    // false (0) - true  (1) = -1 → pending sorts before completed
    // true  (1) - false (0) = 1  → completed sorts after pending
});

sortedForRender.forEach(function (taskObj) {
    const card = createTaskCard(taskObj);
    // appendChild always adds to the END, so pending cards fill the top first,
    // then completed cards follow at the bottom.
    taskList.appendChild(card);
});

// Now that all cards are in the DOM, update the progress bar
updateProgress();


/* ================================================================
   7. NAVBAR HIDE/SHOW ON SCROLL
   ================================================================
   - On home section: navbar always visible
   - Scroll down past home: navbar hides
   - Scroll up 300px+: navbar reappears
================================================================ */

let lastScrollY      = window.scrollY;
let scrollUpDistance = 0;

window.addEventListener("scroll", function () {
    const currentScrollY = window.scrollY;
    const homeBottom     = homeSection.getBoundingClientRect().bottom;

    // Still in the home section — keep navbar visible always
    if (homeBottom > 100) {
        navbar.classList.remove("nav-hidden");
        lastScrollY      = currentScrollY;
        scrollUpDistance = 0;
        return;
    }

    if (currentScrollY > lastScrollY) {
        // Scrolling DOWN
        navbar.classList.add("nav-hidden");
        scrollUpDistance = 0;
    } else {
        // Scrolling UP — accumulate distance
        scrollUpDistance += lastScrollY - currentScrollY;
        if (scrollUpDistance > 300) {
            navbar.classList.remove("nav-hidden");
        }
    }

    lastScrollY = currentScrollY;
});