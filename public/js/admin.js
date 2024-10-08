$(document).on('click', '.admin-actions-gear', function (event) {
    event.stopPropagation(); // Stop click event from propagating

    // Close any already open tooltips
    $('.admin-tooltip').remove();

    // Determine if the post is currently pinned
    const isPinned = $(this).data('pinned'); // This should be set when rendering each post

    // Generate the tooltip HTML based on pin status
    const pinUnpinHtml = isPinned ?
        `<a href="#" onclick="unpinPost('${$(this).data('postid')}');return false;">Unpin Post</a>` :
        `<a href="#" onclick="pinPost('${$(this).data('postid')}');return false;">Pin Post</a>`;

    // Check if the user has admin or super_admin roles
    var rolesString = localStorage.getItem('userRoles');
    var roles = rolesString ? JSON.parse(rolesString) : [];
    var isAdmin = roles.some(role => role.toLowerCase().includes('admin'));

    // Conditionally add the Delete Post link based on admin status
    const deletePostHtml = isAdmin ? `<a href="#" onclick="deletePost('${$(this).data('postid')}');return false;">Delete Post</a>` : '';

    const tooltipHtml = `<div class="admin-tooltip" style="display: none;">
        ${deletePostHtml}
        ${pinUnpinHtml}
    </div>`;

    // Append the tooltip HTML and position it
    $(this).parent().css('position', 'relative').append(tooltipHtml);

    // Calculate and adjust tooltip position
    const gearIconOffset = $(this).position();
    const tooltipWidth = $('.admin-tooltip').outerWidth();
    const gearIconWidth = $(this).outerWidth();
    const leftPosition = gearIconOffset.left + gearIconWidth / 2 - tooltipWidth / 2; // Center tooltip under the gear icon

    // Position and show the tooltip
    $('.admin-tooltip').css({
        top: gearIconOffset.top + $(this).outerHeight() + 5, // Position below the gear icon, adjust 5px for spacing
        left: leftPosition,
        position: 'absolute'
    }).fadeIn(200);

    // Prevent the tooltip from closing when clicking inside it
    $('.admin-tooltip').on('click', function (event) {
        event.stopPropagation();
    });
});



// Close the tooltip when clicking anywhere else on the page
$(document).on('click', function () {
    $('.admin-tooltip').fadeOut(200, function () {
        $(this).remove();
    });
});

$(document).ready(function () {

    showHideAdminUI();
});

function showHideAdminUI() {

    var rolesString = localStorage.getItem('userRoles');
    var roles = rolesString ? JSON.parse(rolesString) : [];
    var isAdmin = false;

    for (var i = 0; i < roles.length; i++) {
        if (roles[i].toLowerCase().indexOf('admin') !== -1) {
            isAdmin = true;
            break; // Break out of the loop once an admin role is found
        }
    }

    if (isAdmin) {
        $('body').addClass('is_admin');
    } else {
        $('body').removeClass('is_admin');


    }

}

function deletePost(postId) {
    // Confirm with the user before proceeding to delete
    if (!confirm("Are you sure you want to delete this post?")) {
        return; // User canceled the action
    }

    // Retrieve the authToken stored in localStorage
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        console.error('User is not logged in or authToken is missing.');
        alert('You need to be logged in to delete posts.');
        return;
    }

    // Retrieve the category from the same element that has the postId
    const category = $(`div.post[data-postid="${postId}"]`).data('postcat');

    // Make a POST request to the deletePost API endpoint, including the category
    fetch('/api/deletePost', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}` // Use the authToken for authentication
        },
        body: JSON.stringify({ postId, category }) // Send both postId and category in the request body
    })
        .then(response => {
            if (!response.ok) {
                // If the server responds with a not OK status, throw an error to be caught later
                throw new Error(`Failed to delete post. Status: ${response.status}`);
            }
            return response.json(); // Parse the JSON response body
        })
        .then(data => {

            showNotification('Post deleted successfully.', type = 'success', duration = 2000);

            // Remove the post from the DOM
            $(`div.post[data-postid="${postId}"]`).fadeOut("slow", function () {
                $(this).remove();
            });
        })
        .catch(error => {
            // Log any errors to the console and show an error message to the user
            console.error('Error deleting post:', error);
            alert('There was a problem deleting the post.');
        });
}

function pinPost(postId) {
    // Retrieve the authToken stored in localStorage
    var authToken = localStorage.getItem('authToken');
    if (!authToken) {
        alert('You must be logged in to pin a post.');
        return;
    }
    const category = $(`div.post[data-postid="${postId}"]`).data('postcat');


    // Make a POST request to the pinPost API endpoint
    $.ajax({
        url: '/api/pinPost',
        type: 'POST',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + authToken },
        data: JSON.stringify({ category: category, post_id: postId }),
        success: function (response) {
            showNotification('Post pinned successfully.', type = 'success', duration = 3000);
        },
        error: function (xhr, status, error) {
            showNotification(xhr.responseJSON.message, type = 'error', duration = 5000);

        }
    });
}

function unpinPost(postId) {
    // Retrieve the authToken stored in localStorage
    var authToken = localStorage.getItem('authToken');
    if (!authToken) {
        alert('You must be logged in to pin a post.');
        return;
    }
    const category = $(`div.post[data-postid="${postId}"]`).data('postcat');


    // Make a POST request to the pinPost API endpoint
    $.ajax({
        url: '/api/unpinPost',
        type: 'POST',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + authToken },
        data: JSON.stringify({ category: category, post_id: postId }),
        success: function (response) {
            showNotification('Post unpinned successfully.', type = 'success', duration = 3000);
        },
        error: function (xhr, status, error) {
            showNotification(xhr.responseJSON.message, type = 'error', duration = 5000);
        }
    });
}
