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
            localStorage.setItem('userRoles', JSON.stringify([]));

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


    function handleFormSubmission(isLoginMode, username, password, email,honeypot) {
        const actionUrl = isLoginMode ? '/api/login' : '/api/register';
        const formMessage = document.getElementById('formMessage');
    
        // Disable form fields to prevent multiple submissions
        disableFormFields();
    
        if (!isLoginMode) {
            // Validate username before attempting to register
            const result = validateUsername(username);
            if (!result.isValid) {
                showNotification(result.message, 'error', 5000);
                enableFormFields(); // Re-enable form fields if validation fails
                return;
            }
    
            // Only handle reCAPTCHA and registration here
            grecaptcha.ready(function() {
                grecaptcha.execute('6Lfh2sApAAAAAB_-Xt310RQ5kYgu_wOSPA2sEfu2', { action: 'register' }).then(function(token) {
                    // Include reCAPTCHA token in the registration payload
                    console.log(honeypot); 
                    const payload = { username, password, email, recaptchaToken: token,honeypot:honeypot };
                    submitFormData(actionUrl, payload);
                });
            });
        } else {
            // Login does not require reCAPTCHA
            const payload = { username, password,honeypot };
            submitFormData(actionUrl, payload);
        }
    }
    
    function submitFormData(url, data) {
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            const formMessage = document.getElementById('formMessage');
            console.log(data);
            if (data.auth === true || (data.message && data.message.includes('successful'))) {
                // Successful login or registration
                localStorage.setItem('authToken', data.token || '');
                localStorage.setItem('username', data.username || '');
    
                if (data.token) {
                    const decodedToken = parseJwt(data.token);
                    localStorage.setItem('userRoles', JSON.stringify(decodedToken.roles || []));
                    localStorage.setItem('userSubscriptions', JSON.stringify(data.subscriptions || []));
                    console.log('Roles:', localStorage.getItem('userRoles'));
                }
                updateUIBasedOnAuthStatus();

                
                formMessage.textContent = data.message || 'Action successful. Redirecting...';
                formMessage.style.color = 'limegreen';
                setTimeout(() => { loginRegisterForm.style.display = 'none'; }, 1000);
            } else {
                // Handle errors or informative messages from server
                formMessage.textContent = data.message;
                formMessage.style.color = 'red';
                enableFormFields();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            formMessage.textContent = 'An error occurred, please try again.';
            formMessage.style.color = 'red';
            enableFormFields();
        });
    }
    
    function disableFormFields() {
        document.getElementById('username').disabled = true;
        document.getElementById('password').disabled = true;
        const emailField = document.getElementById('email');
        if (emailField) emailField.disabled = true;
        document.getElementById('submitAuth').disabled = true;
    }
    
    function enableFormFields() {
        document.getElementById('username').disabled = false;
        document.getElementById('password').disabled = false;
        const emailField = document.getElementById('email');
        if (emailField) emailField.disabled = false;
        document.getElementById('submitAuth').disabled = false;
    }
    
    function handleResponse(data) {
        const formMessage = document.getElementById('formMessage');
        if (data.auth === true || (data.message && data.message.includes('successful'))) {
            // Success logic here...
            console.log('Action successful. Redirecting...');
            setTimeout(() => { loginRegisterForm.style.display = 'none'; }, 1000);
        } else {
            // Error or informative message from server
            formMessage.textContent = data.message;
            formMessage.style.color = 'red';
        }
        enableFormFields();
    }
    
    function handleError(error) {
        console.error('Error:', error);
        const formMessage = document.getElementById('formMessage');
        formMessage.textContent = 'An error occurred, please try again.';
        formMessage.style.color = 'red';
        enableFormFields();
    }
    
    




    function updateUIBasedOnAuthStatus() {
        const authToken = localStorage.getItem('authToken');
        const $loginRegisterButton = $('#loginRegisterButton');
        const $logoutButton = $('#logoutButton'); // Use jQuery to get the logout button
        const $userDisplayElement = $('#userDisplay');
    
        if (authToken && !isJwtExpired(authToken)) {
            // Token is present and not expired
            const username = localStorage.getItem('username');
            if (username) {
                $userDisplayElement.html(`<i style="position:relative;top:1px" class="fa fa-user-circle" aria-hidden="true"></i> <a href="/u/${username}">${username}</a>`);
                $userDisplayElement.show();
                $loginRegisterButton.hide();
                $logoutButton.show(); // Show the logout button using jQuery
                $('.save_post.save_post_post_page').show(); // show save post button
            }
        } else {
            // No token, or it is expired
            localStorage.removeItem('authToken'); // Clean up
            localStorage.removeItem('username');
            $userDisplayElement.hide();
            $loginRegisterButton.show();
            $logoutButton.hide(); // Hide the logout button using jQuery
        }

        showHideAdminUI();

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





    document.getElementById('authForm').addEventListener('submit', function (e) {
        e.preventDefault();
    
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const emailField = document.getElementById('email');
        const email = emailField ? emailField.value : '';
        const hp = document.getElementById('hpCheckbox').checked;

        if (!isLoginMode) {
            const tosChecked = document.getElementById('tosCheckbox')?.checked;
            const privacyChecked = document.getElementById('privacyCheckbox')?.checked;
    
            // Validate checkboxes
            if (!tosChecked || !privacyChecked) {
                alert('You must agree to the Terms of Service and Privacy Policy to register.');
                return;
            }
        }
    

        handleFormSubmission(isLoginMode, username, password, email,hp);
    });
    
    
    
    // Close the form lightbox when clicking outside of it
    loginRegisterForm.addEventListener('click', function (e) {
        if (e.target === loginRegisterForm) {
            $('.grecaptcha-badge').css({ 'visibility': 'hidden','display': 'none'}); 

            loginRegisterForm.style.display = 'none';
        }

    });

    function updateFormMode() {
        if (isLoginMode) {
            formTitle.textContent = 'Login';
            submitAuthButton.value = 'Login';
            switchAuthMode.innerHTML = 'Don\'t have an account? <a href="#" id="switchForm">Register here.</a>';
            document.getElementById('email')?.remove();
    
            // Remove checkboxes if they exist
            document.getElementById('tosCheckbox')?.parentNode.remove();
            document.getElementById('privacyCheckbox')?.parentNode.remove();
    
            $('.grecaptcha-badge').css({ 'visibility': 'hidden', 'display': 'none' }); 
            $('.form-group-agree-terms').remove(); 
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
    
            // Add checkboxes for TOS and Privacy Policy
            addCheckboxes();
    
            $('.grecaptcha-badge').css({ 'visibility': 'initial','display': 'block'}); 
        }
    }
    function addCheckboxes() {
        const $submitButton = $('#submitAuth'); // Get the submit button using jQuery
    
        // Remove existing checkboxes if they exist
        $('.form-group-agree-terms').remove();
    
        // HTML for the Terms of Service checkbox
        const tosCheckboxHtml = `
            <div class="form-group-agree-terms">
                <label>
                    <input type="checkbox" id="tosCheckbox" name="tos" required>
                    I agree to the <a href="/c/azodu/123e4567-e89b-12d3-a456-426614174002/azodu-terms-of-service" target="_blank">Terms of Service</a>
                </label>
            </div>
        `;
    
        // HTML for the Privacy Policy checkbox
        const privacyCheckboxHtml = `
            <div class="form-group-agree-terms">
                <label>
                    <input type="checkbox" id="privacyCheckbox" name="privacy" required>
                    I agree to the <a href="/c/azodu/123e4567-e89b-12d3-a456-426614174003/azodu-privacy-policy" target="_blank">Privacy Policy</a>
                </label>
            </div>
        `;
    
        // Insert the TOS and Privacy Policy checkboxes before the submit button using jQuery
        $submitButton.before(tosCheckboxHtml + privacyCheckboxHtml);
    }
    
    

    // Function to decode JWT from the local storage
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("Error decoding token: ", e);
            return null;
        }
    }


});