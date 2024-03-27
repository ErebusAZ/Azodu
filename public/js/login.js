$(document).ready(function () {


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
        // Disable form elements to prevent multiple submissions
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
            .then(response => response.text())
            .then(data => {
                formMessage.textContent = data; // Display success or error message
                formMessage.style.color = 'limegreen'; // Success color

                if (!isLoginMode || (isLoginMode && data.includes('successful'))) {
                    // Optionally close the form after a delay on success
                    setTimeout(() => { loginRegisterForm.style.display = 'none'; }, 3000);
                } else {
                    // If login fails, do not close the form
                    // Re-enable form elements
                    document.getElementById('username').disabled = false;
                    document.getElementById('password').disabled = false;
                    if (emailField) emailField.disabled = false;
                    document.getElementById('submitAuth').disabled = false;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                formMessage.textContent = 'An error occurred, please try again.'; // Display error message
                formMessage.style.color = 'red'; // Error color

                // Re-enable form elements on failure
                document.getElementById('username').disabled = false;
                document.getElementById('password').disabled = false;
                if (emailField) emailField.disabled = false;
                document.getElementById('submitAuth').disabled = false;
            });
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