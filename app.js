document.addEventListener('DOMContentLoaded', function () {
  // Initialize the Geni SDK
  Geni.init({
    app_id: 'HhFyIJP0V3w1KLwT6X0GJLsxAIuOEZVC9kE9vlMA', // Replace with your actual Client ID
    logging: true,
    cookie: true,
  });

  // Global delay for rate limiting (hardcoded 11 seconds)
  const REQUEST_DELAY = 11000;

  // Helper function to delay execution (for rate limiting)
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Function to handle user authentication
  function authenticate(callback) {
    console.log("Authenticating...");
    if (Geni._access_token) {
      console.log("Already authenticated.");
      callback();
    } else {
      Geni.Auth.connect(function (response) {
        if (response && response.access_token) {
          console.log('Authenticated successfully. Access token:', Geni._access_token);
          callback();
        } else {
          console.error('Authentication failed:', response);
          alert('Authentication failed. Please try again.');
        }
      });
    }
  }

  // Fetch ancestors by GUID (initial API call using GUID)
  async function fetchAncestorsByGUID(guid, ancestors = {}) {
    console.log(`Fetching ancestors for profile GUID ${guid}...`);
    return new Promise((resolve) => {
      Geni.api(`/profile-g${guid}/immediate-family`, async function (response) {
        if (response && response.focus) {
          const profileData = response.focus;
          console.log(`Fetched immediate family for profile GUID ${guid}:`, profileData);

          // Add profile to ancestors list
          ancestors[profileData.id] = {
            name: profileData.name,
            id: profileData.id,
            guid: profileData.guid,
          };

          let parents = [];

          // Extract parents from the union in nodes
          if (response.nodes && response.nodes[profileData.id].edges) {
            const edges = response.nodes[profileData.id].edges;
            for (const unionKey in edges) {
              if (edges[unionKey].rel === "child" && response.nodes[profileData.id].edges[unionKey]) {
                const unionData = response.nodes[unionKey];
                if (unionData && unionData.edges) {
                  for (const parentKey in unionData.edges) {
                    if (unionData.edges[parentKey].rel === "partner") {
                      const parentNode = response.nodes[parentKey];
                      const parentID = parentNode.id.replace('profile-', ''); // Extract profile ID without 'profile-'
                      if (parentID) {
                        parents.push({ id: parentID });
                      }
                    }
                  }
                }
              }
            }
          }

          if (parents.length > 0) {
            console.log(`Profile ${guid} has parents:`, parents.map(p => p.id));
          } else {
            console.log(`Profile ${guid} has no parents listed.`);
          }

          // Sequentially fetch parents with a delay
          for (const parent of parents) {
            await delay(REQUEST_DELAY);  // Ensure delay is applied before each API call
            const parentData = await fetchParentProfileByID(parent.id, ancestors); // Fetch using Profile ID
            if (parentData && parentData.guid) {
              await fetchAncestorsByGUID(parentData.guid, ancestors);  // Recursive call with GUID after fetching parent's data
            }
          }

          // Cache the ancestors list
          localStorage.setItem(guid, JSON.stringify(ancestors));  
          console.log(`Stored ancestors for profile GUID ${profileData.guid} in local storage.`);
          resolve(ancestors);
        } else {
          console.warn(`No data found for profile GUID ${guid}.`);
          resolve(ancestors);
        }
      });
    });
  }

  // Fetch parent's profile by profile ID (use this to get GUID for further recursion)
  async function fetchParentProfileByID(profileId, ancestors = {}) {
    console.log(`Fetching profile for parent ID ${profileId}...`);
    return new Promise((resolve) => {
      Geni.api(`/profile-${profileId}`, function (response) {
        if (response && response.focus) {
          const parentData = response.focus;
          console.log(`Fetched parent profile for ID ${profileId}:`, parentData);

          // Add parent to ancestors list
          ancestors[parentData.id] = {
            name: parentData.name,
            id: parentData.id,
            guid: parentData.guid,
          };

          resolve(parentData);  // Return the parent's data (including GUID)
        } else {
          console.warn(`No data found for parent ID ${profileId}.`);
          resolve(null);
        }
      });
    });
  }

  // Event listener for the fetch button
  document.getElementById('fetch-btn').addEventListener('click', function () {
    const profileUrls = document.getElementById('profile-urls').value.trim().split('\n');
    console.log("Profile URLs entered:", profileUrls);

    if (profileUrls.length > 1) {
      authenticate(async function () {
        let allAncestors = {};

        // Sequentially process each profile
        for (const profileUrl of profileUrls) {
          const profileGUID = extractProfileGUID(profileUrl.trim());
          console.log(`Extracted Profile GUID: ${profileGUID} from URL: ${profileUrl.trim()}`);

          if (profileGUID) {
            console.log(`Fetching ancestors for Profile GUID: ${profileGUID}`);
            await delay(REQUEST_DELAY);  // Add delay before fetching the next profile to respect rate limits
            const ancestors = await fetchAncestorsByGUID(profileGUID);
            console.log(`Ancestors fetched for Profile GUID ${profileGUID}:`, Object.keys(ancestors));
            allAncestors[profileGUID] = ancestors;
          } else {
            console.error(`Invalid Profile URL: ${profileUrl}`);
          }
        }

        // Output the final results or process further
        console.log("All Ancestors Processed:", allAncestors);
      });
    } else {
      alert('Please enter at least two profile URLs');
    }
  });

  // Function to extract the profile GUID from the URL
  function extractProfileGUID(url) {
    const regex = /\/people\/[^\/]+\/(\d+)/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1]; // Return the profile GUID
    }
    console.error(`Unable to extract Profile GUID from URL: ${url}`);
    return null;
  }

  // Event listener for the clear cache button
  document.getElementById('clear-cache-btn').addEventListener('click', function () {
    localStorage.clear();
    console.log('Cache cleared.');
  });

});
