document.addEventListener('DOMContentLoaded', function () {
  // Initialize the Geni SDK
  Geni.init({
    app_id: 'HhFyIJP0V3w1KLwT6X0GJLsxAIuOEZVC9kE9vlMA', // Replace with your actual Client ID
    logging: true,
    cookie: true,
  });

  // Global delay for rate limiting (hardcoded 11 seconds)
  const REQUEST_DELAY = 11000;

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

  // Fetch and store ancestors for each profile recursively
  async function fetchAncestors(profileId, ancestors = {}) {
    console.log(`Checking local storage for profile ${profileId}`);
    const storedData = localStorage.getItem(profileId);
    if (storedData) {
      console.log(`Found profile ${profileId} in local storage. Data:`, JSON.parse(storedData));
      return JSON.parse(storedData);
    }
  
    console.log(`Fetching ancestors for profile ${profileId}...`);
    return new Promise((resolve) => {
      Geni.api(`/profile-g${profileId}/immediate-family`, async function (response) {
        if (response && response.focus) {
          const profileData = response.focus;
          console.log(`Fetched immediate family for profile ${profileData.id}:`, profileData);
          ancestors[profileData.id] = profileData;
  
          // Check parents in the focus object (if available)
          let parents = response.focus.parents || [];
  
          // Check for parents in the nodes and edges if not in focus
          if (response.nodes && response.nodes[profileData.id].edges) {
            const edges = response.nodes[profileData.id].edges;
            for (const unionKey in edges) {
              if (edges[unionKey].rel === "child") {
                for (const parentId in response.nodes) {
                  if (response.nodes[parentId].edges && response.nodes[parentId].edges[unionKey] && response.nodes[parentId].edges[unionKey].rel === "partner") {
                    parents.push({ id: parentId });
                  }
                }
              }
            }
          }
  
          if (parents.length > 0) {
            console.log(`Profile ${profileData.id} has parents:`, parents.map(p => p.id));
          } else {
            console.log(`Profile ${profileData.id} has no parents listed.`);
          }
  
          // Recursively fetch ancestors for the parents
          for (const parent of parents) {
            await delay(REQUEST_DELAY); // Delay to respect rate limits
            await fetchAncestors(parent.id, ancestors); // Recursive call to fetch parents
          }
  
          // Store ancestors in localStorage for future reference
          localStorage.setItem(profileId, JSON.stringify(ancestors));
          console.log(`Stored ancestors for profile ${profileId} in local storage.`);
          resolve(ancestors);
        } else {
          console.warn(`No data found for profile ${profileId}.`);
          resolve(ancestors);
        }
      });
    });
  }
  

  // Find the most recent common ancestor (MRCA) between two profiles
  function findMRCA(ancestors1, ancestors2) {
    console.log("Finding MRCA...");
    console.log("Ancestors from first profile:", Object.keys(ancestors1));
    console.log("Ancestors from second profile:", Object.keys(ancestors2));

    const ancestorIds1 = Object.keys(ancestors1);
    const ancestorIds2 = Object.keys(ancestors2);

    // Find common ancestors
    const commonAncestors = ancestorIds1.filter(id => ancestorIds2.includes(id));
    console.log("Common Ancestors Found:", commonAncestors);

    if (commonAncestors.length > 0) {
      return commonAncestors[0]; // Returning the first common ancestor for simplicity
    }

    return null;
  }

  // Helper function to delay execution (for rate limiting)
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event listener for the clear cahce button
  document.getElementById('clear-cache-btn').addEventListener('click', function () {
    localStorage.clear();
  });

  // Event listener for the fetch button
  document.getElementById('fetch-btn').addEventListener('click', function () {
    const profileUrls = document.getElementById('profile-urls').value.trim().split('\n'); // Corrected this line
    console.log("Profile URLs entered:", profileUrls);

    if (profileUrls.length > 1) {
      authenticate(async function () {
        let allAncestors = {};

        // Extract and process each profile
        for (const profileUrl of profileUrls) {
          const profileId = extractProfileId(profileUrl.trim());
          console.log(`Extracted Profile ID: ${profileId} from URL: ${profileUrl.trim()}`);

          if (profileId) {
            console.log(`Fetching ancestors for Profile ID: ${profileId}`);
            const ancestors = await fetchAncestors(profileId);
            console.log(`Ancestors fetched for Profile ID ${profileId}:`, Object.keys(ancestors));
            allAncestors[profileId] = ancestors;
          } else {
            console.error(`Invalid Profile URL: ${profileUrl}`);
          }
        }

        // Find MRCAs between profiles
        const profileIds = Object.keys(allAncestors);
        console.log("All Profile IDs processed:", profileIds);
        let results = '';
        for (let i = 0; i < profileIds.length; i++) {
          for (let j = i + 1; j < profileIds.length; j++) {
            console.log(`Checking MRCA between Profile ID ${profileIds[i]} and ${profileIds[j]}`);
            const mrca = findMRCA(allAncestors[profileIds[i]], allAncestors[profileIds[j]]);
            results += `MRCA between ${profileIds[i]} and ${profileIds[j]}: ${mrca || 'None'}<br/>`;
          }
        }

        console.log("Final Results:", results);
        document.getElementById('result').innerHTML = results;
      });
    } else {
      alert('Please enter at least two profile URLs');
    }
  });

  // Function to extract the profile ID from the URL
  function extractProfileId(url) {
    const regex = /\/people\/[^\/]+\/(\d+)/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1]; // Return the profile ID
    }
    console.error(`Unable to extract Profile ID from URL: ${url}`);
    return null;
  }
});
