$(document).ready(function () {


    updateUIBasedOnAuthStatus();


    const loginRegisterButton = document.getElementById('loginRegisterButton');
    const loginRegisterForm = document.getElementById('loginRegisterForm');
    const formTitle = document.getElementById('formTitle');
    const submitAuthButton = document.getElementById('submitAuth');
    const switchAuthMode = document.getElementById('switchAuthMode');
    let isLoginMode = true;

    // Toggle form display
    loginRegisterButton.addEventListener('click', function () {
        loginRegisterForm.style.display = 'flex'; // Show the form
    });

    // Switch between login and registration
    document.addEventListener('click', function (e) {
        if (e.target.id === 'switchForm') {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            updateFormMode();
        }
    });


    function handleFormSubmission(isLoginMode, username, password, email) {
        // Elements disabling
        document.getElementById('username').disabled = true;
        document.getElementById('password').disabled = true;
        const emailField = document.getElementById('email');
        if (emailField) emailField.disabled = true;
        document.getElementById('submitAuth').disabled = true;

        const actionUrl = isLoginMode ? '/api/login' : '/api/register';
        const payload = isLoginMode ? { username, password } : { username, password, email };
        const formMessage = document.getElementById('formMessage');

        fetch(actionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(response => response.json()) // Expecting JSON response now
            .then(data => {
                if (data.auth === true || (data.message && data.message.includes('successful'))) {
                    // Handle both login and registration success
                    localStorage.setItem('authToken', data.token || ''); // Fallback to empty string if no token is present
                    localStorage.setItem('username', username); // Store username for displaying
                    displayUsername(username); // Update UI with username
                    formMessage.textContent = data.message || 'Action successful. Redirecting...';
                    formMessage.style.color = 'limegreen';

                    // Optionally close the form after a delay on success
                    setTimeout(() => { loginRegisterForm.style.display = 'none'; }, 1000);
                } else {
                    // Display error or informative message from server
                    formMessage.textContent = data.message;
                    formMessage.style.color = 'red';
                    resetFormFields();
                }
            })
            .catch(error => {
                console.error('Error:', error);
                formMessage.textContent = 'An error occurred, please try again.';
                formMessage.style.color = 'red';
                resetFormFields();
            });
    }

    function displayUsername(username) {
        // Assuming you have a place in your UI to display the username
        const userDisplayElement = document.getElementById('userDisplay'); // Ensure this element exists in your HTML
        if (userDisplayElement) {
            userDisplayElement.textContent = `Logged in as ${username}`;
            loginRegisterButton.style.display = 'none';
        }
    }

    function isJwtExpired(token) {
        if (!token) return true; // No token means "expired"

        try {
            const base64Url = token.split('.')[1]; // JWT structure: Header.Payload.Signature
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));

            // JWT exp is in seconds
            const now = new Date().getTime() / 1000; // Convert to seconds
            return payload.exp < now;
        } catch (error) {
            console.error("Error decoding token:", error);
            return true; // Assume expired on any error
        }
    }


    function updateUIBasedOnAuthStatus() {
        const authToken = localStorage.getItem('authToken');
        const loginRegisterButton = document.getElementById('loginRegisterButton');
        const userDisplayElement = document.getElementById('userDisplay');

        if (authToken && !isJwtExpired(authToken)) {
            // Token is present and not expired
            const username = localStorage.getItem('username');
            if (username && userDisplayElement) {
                userDisplayElement.innerHTML = 'Logged in as <a href="#">' + username + '</a>';
                userDisplayElement.style.display = '';
                loginRegisterButton.style.display = 'none';
            }
        } else {
            // No token, or it is expired
            localStorage.removeItem('authToken'); // Clean up
            localStorage.removeItem('username');
            if (userDisplayElement) {
                userDisplayElement.style.display = 'none';
            }
            loginRegisterButton.style.display = '';
        }
    }


    function resetFormFields() {
        document.getElementById('username').disabled = false;
        document.getElementById('password').disabled = false;
        const emailField = document.getElementById('email');
        if (emailField) emailField.disabled = false;
        document.getElementById('submitAuth').disabled = false;
        // Clear form message color
        const formMessage = document.getElementById('formMessage');
        formMessage.style.color = '';
    }






    // Handle form submission
    document.getElementById('authForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const email = document.getElementById('email') ? document.getElementById('email').value : '';
        console.log(username, password, isLoginMode);
        handleFormSubmission(isLoginMode, username, password, email);

    });

    // Close the form lightbox when clicking outside of it
    loginRegisterForm.addEventListener('click', function (e) {
        if (e.target === loginRegisterForm) {
            loginRegisterForm.style.display = 'none';
        }
    });

    function updateFormMode() {
        if (isLoginMode) {
            formTitle.textContent = 'Login';
            submitAuthButton.value = 'Login';
            switchAuthMode.innerHTML = 'Don\'t have an account? <a href="#" id="switchForm">Register here.</a>';
            document.getElementById('email')?.remove();
        } else {
            formTitle.textContent = 'Register';
            submitAuthButton.value = 'Register';
            switchAuthMode.innerHTML = 'Already have an account? <a href="#" id="switchForm">Login here.</a>';
            if (!document.getElementById('email')) {
                const emailInput = document.createElement('input');
                emailInput.type = 'email';
                emailInput.id = 'email';
                emailInput.placeholder = 'Email';
                emailInput.required = true;
                submitAuthButton.before(emailInput);
            }
        }
    }


});