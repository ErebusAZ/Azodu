function validateUsername(username) {
    const minLength = 3;
    const maxLength = 20;
    const regex = /^[a-zA-Z0-9]+$/; // Alphanumeric characters only

    let message = "";
    let isValid = true;

    // Check for empty username
    if (!username) {
        message = "Username cannot be empty.";
        isValid = false;
    }
    // Check for length constraints
    else if (username.length < minLength || username.length > maxLength) {
        message = `Username must be between ${minLength} and ${maxLength} characters long.`;
        isValid = false;
    }
    // Check for spaces or tabs
    else if (/\s/.test(username)) { // \s matches spaces, tabs, and other whitespace characters
        message = "Username cannot contain spaces or tabs.";
        isValid = false;
    }
    // Check for alphanumeric characters only
    else if (!regex.test(username)) {
        message = "Username must contain only alphanumeric characters.";
        isValid = false;
    }

    return { isValid, message };
}




$(document).ready(function () {


    updateUIBasedOnAuthStatus();

    const logoutButton = document.getElementById('logoutButton');

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            // Remove the token
            localStorage.removeItem('authToken');
            localStorage.removeItem('username'); // If you're also storing the username
            localStorage.removeItem('userSubscriptions');
        
            window.location.href = '/'; // Redirect to login page or home page
        });
    }


    const loginRegisterButton = document.getElementById('loginRegisterButton');
    const loginRegisterForm = document.getElementById('loginRegisterForm');
    const formTitle = document.getElementById('formTitle');
    const submitAuthButton = document.getElementById('submitAuth');
    const switchAuthMode = document.getElementById('switchAuthMode');
    let isLoginMode = true;

    // Toggle form display

    if (loginRegisterButton) {
        loginRegisterButton.addEventListener('click', function () {
            loginRegisterForm.style.display = 'flex'; // Show the form
        });
        
    }

    // Switch between login and registration
    document.addEventListener('click', function (e) {
        if (e.target.id === 'switchForm') {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            updateFormMode();
        }
    });


    function handleFormSubmission(isLoginMode, username, password, email) {

        const actionUrl = isLoginMode ? '/api/login' : '/api/register';
        const payload = isLoginMode ? { username, password } : { username, password, email };
        const formMessage = document.getElementById('formMessage');

        if (!isLoginMode) {

            const result = validateUsername(username);
            if (!result.isValid) {
                showNotification(result.message, 'error', 5000);
                return;


            }

        }

        document.getElementById('username').disabled = true;
        document.getElementById('password').disabled = true;
        const emailField = document.getElementById('email');
        if (emailField) emailField.disabled = true;
        document.getElementById('submitAuth').disabled = true;

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
                    updateUIBasedOnAuthStatus();
                    formMessage.textContent = data.message || 'Action successful. Redirecting...';
                    formMessage.style.color = 'limegreen';

                    // New: Store subscriptions in local storage
                    if (data.subscriptions) {
                        localStorage.setItem('userSubscriptions', JSON.stringify(data.subscriptions));
                    } else {
                        // Handle the case where no subscriptions are returned, or the user has none
                        localStorage.setItem('userSubscriptions', JSON.stringify([]));
                    }


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

 


    function updateUIBasedOnAuthStatus() {
        const authToken = localStorage.getItem('authToken');
        const loginRegisterButton = document.getElementById('loginRegisterButton');
        const logoutButton = document.getElementById('logoutButton'); // Get the logout button
        const userDisplayElement = document.getElementById('userDisplay');
    
        if (authToken && !isJwtExpired(authToken)) {
            // Token is present and not expired
            const username = localStorage.getItem('username');
            if (username && userDisplayElement) {
                userDisplayElement.innerHTML = `<i style="position:relative;top:1px" class="fa fa-user-circle" aria-hidden="true"></i> <a href="#">${username}</a>`;
                userDisplayElement.style.display = '';
                loginRegisterButton.style.display = 'none';
                logoutButton.style.display = ''; // Show the logout button
            }
        } else {
            // No token, or it is expired
            localStorage.removeItem('authToken'); // Clean up
            localStorage.removeItem('username');
            if (userDisplayElement) {
                userDisplayElement.style.display = 'none';
            }
            if(loginRegisterButton)
                loginRegisterButton.style.display = '';
            if(logoutButton)
            logoutButton.style.display = 'none'; // Hide the logout button
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