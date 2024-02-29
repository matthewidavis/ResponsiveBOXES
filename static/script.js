document.addEventListener("DOMContentLoaded", function() {
    const canvasContainer = document.getElementById("canvas-container");
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const boxes = [];
    let drawing = false;
    let currentBox = {};
    let currentColor = "red";
    let motionDetectionRunning = false;
    let previousFrame = null; // Initialize a variable to store the previous frame

    setupUIEventListeners();
    setupCanvasDrawing();
    restoreStateFromLocalStorage();
    initOpenCVMotionDetection();

    // Initialize OpenCV Motion Detection
    function initOpenCVMotionDetection() {
        cv['onRuntimeInitialized'] = () => {
            console.log('OpenCV initialized');
            // Any additional initialization if required
        };
    }

    // Start Motion Detection
    function startMotionDetection() {
        // Check if motion detection is already running
        if (!motionDetectionRunning) {
            console.log('Starting motion detection');
            motionDetectionRunning = true;

            const cameraFeeds = document.querySelectorAll('.camera-feed');
            cameraFeeds.forEach(imgElement => {
                if (imgElement) {
                    processSnapshotForMotionDetection(imgElement);
                }
            });
        } else {
            console.log('Motion detection already running');
        }
    }

    // Stop Motion Detection
    function stopMotionDetection() {
        if (motionDetectionRunning && !document.querySelector('.activation-checkbox:checked')) {
            console.log('Stopping motion detection');
            motionDetectionRunning = false;
        }
    }

    // Add Camera Feed
    function addCameraFeed() {
        const ipAddress = document.getElementById("cameraIP").value;
        if (ipAddress) {
            sendCameraSetupCommand(ipAddress, () => {
                const feedContainer = document.createElement("div");
                feedContainer.className = "camera-feed-container";

                const imgElement = document.createElement("img");
                imgElement.className = "camera-feed";
                feedContainer.appendChild(imgElement);

                const deleteButton = document.createElement("button");
                deleteButton.textContent = "Delete Feed";
                deleteButton.className = "delete-feed-button";
                deleteButton.onclick = () => deleteCameraFeed(feedContainer);
                feedContainer.appendChild(deleteButton);

                document.getElementById("cameraFeeds").appendChild(feedContainer);
                updateCameraFeed(imgElement, ipAddress);

                adjustCanvasSize();
            });
        }
    }

    // Update Camera Feed and Process for Motion Detection
    function updateCameraFeed(imgElement, ipAddress) {
        async function fetchAndUpdateImage() {
            try {
                console.log('Fetching image for camera feed');
                const response = await fetch(`http://${ipAddress}/snapshot.jpg?timestamp=${new Date().getTime()}`);
                if(response.ok) {
                    const imageBlob = await response.blob();
                    imgElement.src = URL.createObjectURL(imageBlob);

                    // Process image for motion detection only if motion detection is running
                    if (motionDetectionRunning) {
                        processSnapshotForMotionDetection(imgElement);
                    }
                } else {
                    console.log('Image fetch unsuccessful');
                }
            } catch (error) {
                console.error('Error fetching image:', error);
            }
        }

        // Set an interval to fetch and update the image regularly
        const intervalId = setInterval(fetchAndUpdateImage, 1000 / 12); // Adjust the frame rate as needed
        imgElement.dataset.intervalId = intervalId;
    }

    function processSnapshotForMotionDetection(imgElement) {
        console.log('Processing snapshot for motion detection');
        const snapshot = convertImageToMat(imgElement);
        
        let graySnapshot = new cv.Mat();
        cv.cvtColor(snapshot, graySnapshot, cv.COLOR_RGBA2GRAY);
        showImage(graySnapshot, 'grayCanvas'); // Display grayscale image
    
        if (previousFrame !== null) {
            let diff = new cv.Mat();
            cv.absdiff(graySnapshot, previousFrame, diff);
            showImage(diff, 'diffCanvas'); // Display diff image
    
            let threshold = new cv.Mat();
            cv.threshold(diff, threshold, 30, 255, cv.THRESH_BINARY);
            showImage(threshold, 'thresholdCanvas'); // Display threshold image
    
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(threshold, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
            let significantMotionDetected = false;
            for (let i = 0; i < contours.size(); ++i) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                console.log(`Contour area: ${area}`); // Log contour area
                if (area > 100) { // Adjust this threshold value as needed
                    significantMotionDetected = true;
                    break;
                }
            }
    
            if (significantMotionDetected) {
                console.log("Significant motion detected");
                for (const box of boxes) {
                    const motionRect = cv.boundingRect(contours.get(0));
                    console.log("Motion Rect:", motionRect);
                    if (rectIntersects(motionRect, box)) {
                        console.log(`Motion detected in box: `, box);
                        sendHTTPCommand(box.httpCommand);
                        break;
                    }
                }
    
                // Draw contours for visualization
                let color = new cv.Scalar(255, 0, 0);
                for (let i = 0; i < contours.size(); ++i) {
                    cv.drawContours(snapshot, contours, i, color, 1, 8, hierarchy, 0);
                }
                showImage(snapshot, 'contourCanvas'); // Ensure you have a canvas with id 'contourCanvas'
            } else {
                console.log("No significant motion detected");
            }
    
            diff.delete();
            threshold.delete();
            contours.delete();
            hierarchy.delete();
        } else {
            console.log("Previous frame is null. Initializing with current frame.");
        }
    
        if (previousFrame !== null) {
            previousFrame.delete();
        }
        previousFrame = graySnapshot.clone();
    }
    
    
    // Function to display OpenCV images on the webpage
    function showImage(mat, canvasId) {
        const canvas = document.getElementById(canvasId);
        console.log(`Canvas element for id '${canvasId}':`, canvas);
        if (mat.empty()) {
            console.log("Empty mat, not displaying");
            return;
        }
        if (canvas) {
            cv.imshow(canvas, mat); // Display the image on a canvas with specified id
        } else {
            console.error(`No canvas found with id '${canvasId}'`);
        }
    }
    
    
    // Helper function to check if two rectangles intersect
    function rectIntersects(rect1, rect2) {
        const intersects = rect1.x < rect2.startX + rect2.w &&
                           rect1.x + rect1.width > rect2.startX &&
                           rect1.y < rect2.startY + rect2.h &&
                           rect1.height + rect1.y > rect2.startY;
        console.log(`Checking intersection between motion rect and box`, {rect1, rect2, intersects});
        return intersects;
    }
    
    
    
    // Function to display OpenCV images on the webpage
    function showImage(mat, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (mat.empty()) {
            console.log("Empty mat, not displaying");
            return;
        }
        cv.imshow(canvas, mat); // Display the image on a canvas with specified id
    }
    
    function convertImageToMat(imgElement) {
        // Example conversion: Draw the image onto a canvas and convert to cv.Mat
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.width;
        canvas.height = imgElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);
        const imageData = ctx.getImageData(0, 0, imgElement.width, imgElement.height);
    
        // Convert imageData to cv.Mat
        const mat = cv.matFromImageData(imageData);
        return mat;
    }

    function sendCameraSetupCommand(ipAddress, onSuccess) {
        const setupCommandUrl = `http://${ipAddress}/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300`;
        fetch(setupCommandUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                console.log(`Setup command sent to ${ipAddress}, starting snapshot updates.`);
                onSuccess();
            })
            .catch(error => console.error(`Error sending setup command to ${ipAddress}:`, error));
    }
    
    function drawBox(box) {
        context.strokeStyle = box.color;
        context.strokeRect(box.startX, box.startY, box.w, box.h);
        context.fillStyle = box.color;
        context.fillText(box.title, box.startX, box.startY + 10);
        console.log(`Drawing box: startX=${box.startX}, startY=${box.startY}, width=${box.w}, height=${box.h}`);
    }

    function adjustCanvasSize() {
        const feedCount = document.querySelectorAll(".camera-feed-container").length;
        canvas.width = 320 * feedCount;
        canvas.height = 180;
        canvasContainer.style.width = `${canvas.width}px`;
        canvasContainer.style.height = `${canvas.height}px`;
    }

    // Delete Camera Feed
    function deleteCameraFeed(feedContainer) {
        const imgElement = feedContainer.querySelector("img");
        clearInterval(imgElement.dataset.intervalId);
        feedContainer.remove();
        adjustCanvasSize();
        drawAllBoxes();
    }

    function drawAllBoxes() {
        context.clearRect(0, 0, canvas.width, canvas.height);
        boxes.forEach((box) => drawBox(box));
        if (drawing) drawBox(currentBox);
    }

    function setupCurrentBox(index) {
        console.log(`Setting up box with index: ${index}`);
        const colorPicker = document.querySelectorAll(".color-picker")[index];
        const title = document.querySelectorAll(".title-input")[index].value;
        const httpCommand = document.querySelectorAll(".http-command")[index].value;
        const activationCheckbox = document.querySelectorAll(".activation-checkbox")[index];
    
        updateCurrentColor(colorPicker.value);
        currentBox = {
            color: currentColor,
            title: title,
            httpCommand: httpCommand,
        };
    
        activationCheckbox.addEventListener('change', (event) => {
            if (event.target.checked) {
                console.log(`Activating box with index: ${index}`);
                startMotionDetection();
            } else {
                console.log(`Deactivating box with index: ${index}`);
                stopMotionDetection();
            }
        });
        
        // Update or add the current box in the boxes array
        if (boxes[index]) {
            boxes[index] = currentBox; // Update existing box
        } else {
            boxes.push(currentBox); // Add new box
        }
    }
    

    // Setup UI Event Listeners
    function setupUIEventListeners() {
        document.querySelectorAll(".color-picker").forEach((picker) => {
            picker.addEventListener("change", () => updateCurrentColor(picker.value));
        });

        document.querySelectorAll(".draw-box-button").forEach((button, index) => {
            button.addEventListener("click", () => setupCurrentBox(index));
        });

        document.getElementById("clearStateButton").addEventListener("click", clearSavedState);

        setupTestAndClearButtons();
    }

    function setupTestAndClearButtons() {
        document.querySelectorAll(".test-button").forEach((button, index) => {
            button.addEventListener("click", () =>
                sendHTTPCommand(document.querySelectorAll(".http-command")[index].value)
            );
        });
    
        document.querySelectorAll(".clear-button").forEach((button, index) => {
            button.addEventListener("click", () => {
                boxes.splice(index, 1);
                resetInputs(index);
                drawAllBoxes();
                saveStateToLocalStorage();
            });
        });
    }

    function updateCurrentColor(newColor) {
        currentColor = newColor;
    }
    
    function sendHTTPCommand(command) {
        if (!command) {
            console.error("No HTTP command provided.");
            return;
        }
        console.log(`Attempting to send HTTP command: ${command}`);
        fetch(command, { method: 'GET' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log(`Command ${command} sent successfully`);
            })
            .catch(error => console.error(`Failed to send command ${command}:`, error));
    }

    // Setup Canvas Drawing
    function setupCanvasDrawing() {
        canvas.addEventListener("mousedown", (e) => {
            if (e.target === canvas) {
                drawing = true;
                currentBox.startX = e.offsetX;
                currentBox.startY = e.offsetY;
            }
        });

        canvas.addEventListener("mousemove", (e) => {
            if (drawing && e.target === canvas) {
                currentBox.w = e.offsetX - currentBox.startX;
                currentBox.h = e.offsetY - currentBox.startY;
                drawAllBoxes();
            }
        });

        canvas.addEventListener("mouseup", (e) => {
            if (drawing && e.target === canvas) {
                // Clone currentBox to store its state
                const newBox = {...currentBox, startX: currentBox.startX, startY: currentBox.startY, w: currentBox.w, h: currentBox.h};
                boxes.push(newBox);
                drawing = false;
                currentBox = {};
                drawAllBoxes();
                saveStateToLocalStorage();
            }
        });
    }

    function createFeedContainer(ipAddress) {
        const feedContainer = document.createElement("div");
        feedContainer.className = "camera-feed-container";
    
        const imgElement = document.createElement("img");
        imgElement.className = "camera-feed";
        imgElement.src = `http://${ipAddress}/snapshot.jpg`; // Adjust the src as per your requirement
        feedContainer.appendChild(imgElement);
    
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete Feed";
        deleteButton.className = "delete-feed-button";
        deleteButton.onclick = () => deleteCameraFeed(feedContainer);
        feedContainer.appendChild(deleteButton);
    
        return feedContainer;
    }
    
    // Save State to Local Storage
    function saveStateToLocalStorage() {
        const state = {
            boxes: boxes.map(box => ({
                startX: box.startX,
                startY: box.startY,
                w: box.w,
                h: box.h,
                color: box.color,
                title: box.title,
                httpCommand: box.httpCommand,
                active: box.active // Assuming there is a way to determine if a box is active or not
            })),
            cameraFeeds: Array.from(document.querySelectorAll(".camera-feed")).map(img => img.src)
        };
        localStorage.setItem("appState", JSON.stringify(state));
    }

    // Restore State from Local Storage
    function restoreStateFromLocalStorage() {
        const savedState = localStorage.getItem("appState");
        if (savedState) {
            const state = JSON.parse(savedState);
    
            // Restore camera feeds
            state.cameraFeeds.forEach(ipAddress => {
                const feedContainer = createFeedContainer(ipAddress);
                document.getElementById("cameraFeeds").appendChild(feedContainer);
                updateCameraFeed(feedContainer.querySelector("img"), ipAddress);
            });
    
            // Restore boxes with their configurations
            state.boxes.forEach(savedBox => {
                let restoredBox = {
                    startX: savedBox.startX,
                    startY: savedBox.startY,
                    w: savedBox.w,
                    h: savedBox.h,
                    color: savedBox.color,
                    title: savedBox.title,
                    httpCommand: savedBox.httpCommand,
                    active: savedBox.active // Assuming there is an 'active' property to restore
                };
                boxes.push(restoredBox);
            });
            drawAllBoxes();
        }
    }

    function clearSavedState() {
        localStorage.removeItem("appState");
        console.log("Saved state cleared.");
        document.getElementById("cameraFeeds").innerHTML = "";
        boxes.length = 0;
        drawAllBoxes();
    }

    function resetInputs(index) {
        document.querySelectorAll(".title-input")[index].value = "";
        document.querySelectorAll(".color-picker")[index].value = "#ff0000";
        document.querySelectorAll(".http-command")[index].value = "";
    }
    
    

    // Initialize and set up everything
    initOpenCVMotionDetection();
    setupUIEventListeners();
    setupCanvasDrawing();
    restoreStateFromLocalStorage();
    window.addCameraFeed = addCameraFeed;
});
