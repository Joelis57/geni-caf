// Initialize the Geni SDK
Geni.init({
  app_id: 'HhFyIJP0V3w1KLwT6X0GJLsxAIuOEZVC9kE9vlMA', // Replace with your actual Client ID
  logging: true,
  cookie: true,
});

// Function to handle user authentication
function authenticate(callback) {
  if (Geni._access_token) {
    // Already authenticated
    callback();
  } else {
    console.log('Preparing to connect');
    Geni.Auth.connect(function (response) {
      if (response && response.access_token) {
        console.log('Authenticated successfully');
        callback();
      } else {
        console.error('Authentication failed', response);
        alert('Authentication failed. Please try again.');
      }
    });
  }
}

// Event listener for the fetch button
document.getElementById('fetch-btn').addEventListener('click', function () {
  const profileUrl = document.getElementById('profile-url').value;

  // Extract the profile ID from the URL
  const profileId = extractProfileId(profileUrl);

  if (profileId) {
    authenticate(function () {
      fetchProfile(profileId);
    });
  } else {
    console.error('Invalid profile URL');
    document.getElementById('profile-fullname').innerText = 'Invalid profile URL';
  }
});

// Function to extract the profile ID from the URL
function extractProfileId(url) {
  // Geni profile URLs generally look like this:
  // https://www.geni.com/people/John-Doe/6000000000000000001

  // Regular expression to match the profile ID
  const regex = /\/people\/[^\/]+\/(\d+)/;
  const match = url.match(regex);

  if (match && match[1]) {
    return match[1]; // Return the profile ID
  }
  return null;
}

// Function to fetch the profile by ID and display the full name
function fetchProfile(profileId) {
  // Use Geni's API to fetch the profile data
  Geni.api(`/profile-g${profileId}/immediate-family`, function (response) {
    console.log('API Response:', response);
    if (response && response.id) {
      document.getElementById('profile-fullname').innerText = `Full Name: ${response.name}`;
    } else if (response.error) {
      document.getElementById('profile-fullname').innerText = response.error.message;
    } else {
      console.error('Unexpected API response:', response);
      document.getElementById('profile-fullname').innerText = 'No profile found.';
    }
  });
}