document.addEventListener('DOMContentLoaded', function () {
  // Initialize the Geni SDK
  Geni.init({
    app_id: 'HhFyIJP0V3w1KLwT6X0GJLsxAIuOEZVC9kE9vlMA', // Replace with your actual Client ID
    logging: true,
    cookie: true,
  });


  // Schedule a token refresh every hour
  setInterval(function () {
    refreshToken();
  }, 60 * 60 * 1000); // 1 hour

  // Token refresh function
  function refreshToken() {
    console.log('Attempting to refresh the access token...');
    Geni.Auth.refreshAccessToken(function (response) {
      console.log(`Refresh status: ${JSON.stringify(response)}`);
    });
  }

  loadFromCache();

  // Global delay for rate limiting (hardcoded 11 seconds)
  const REQUEST_DELAY = 11000;
  const MAX_DEPTH = 6 + 2;
  const MAX_RETRIES = 100;

  async function retryApiCall(call) {
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      try {
        const result = await call();
        return result;  // Successful call, return the result
      } catch (error) {
        attempts++;
        console.warn(`API call failed on attempt ${attempts}. Retrying in ${delayMs}ms...`, error);
        await delay(REQUEST_DELAY);  // Wait before retrying
      }
    }
    throw new Error(`API call failed after ${MAX_RETRIES} attempts.`);
  }

  // Helper function to delay execution (for rate limiting)
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function loadFromCache() {
    const table = document.getElementById("cached-profiles-table");
    const items = { ...localStorage };
    for (const item in items) {
      // is GUID?
      if (!isNaN(item) && item.length == 19) {
        var ancestors = JSON.parse(items[item]);
        let row = table.insertRow();
        let firstCol = row.insertCell(0);
        firstCol.innerHTML = `<a href="https://www.geni.com/people/x/${ancestors[0].guid}">${ancestors[0].name}</a>`;
        let secondCol = row.insertCell(1);
        secondCol.innerHTML = ancestors.length - 1;
      }
    }
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

  // Fetch ancestors by GUID (initial API call using GUID) and track relation
  async function fetchAncestorsByGUID(guid, relationship, ancestors = []) {
    console.log(`Fetching ancestors for profile GUID ${guid} (Relation: ${relationship})...`);

    await delay(REQUEST_DELAY);
    return retryApiCall(async () => {
      return new Promise((resolve) => {
        Geni.api(`/profile-g${guid}/immediate-family`, async function (response) {
          if (response && response.focus) {
            const profileData = response.focus;
            console.log(`Fetched immediate family for profile GUID ${guid}:`, profileData);

            // Add this ancestor to the ancestors list with the relationship
            ancestors.push({
              guid: profileData.guid,
              name: profileData.name,
              relation: relationship
            });

            let parents = [];

            // Extract parents using profile IDs returned from the union in nodes
            if (response.nodes && response.nodes[profileData.id].edges) {
              const edges = response.nodes[profileData.id].edges;
              for (const unionKey in edges) {
                if (edges[unionKey].rel === "child" && edges[unionKey].rel_modifier !== "adopt" && response.nodes[profileData.id].edges[unionKey]) {
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

            if (isNaN(relationship[0]) || relationship[0] < (MAX_DEPTH - 2)) {
              // Sequentially fetch parents with a delay using their profile IDs to get their GUIDs
              for (const parent of parents) {
                await delay(REQUEST_DELAY);  // Ensure delay is applied before each API call
                const parentData = await fetchParentProfileByID(parent.id, ancestors); // Fetch parent's profile by ID to get GUID
                if (parentData && parentData.guid) {
                  // Continue fetching ancestors for the parent using their GUID, updating the relationship
                  await fetchAncestorsByGUID(
                    parentData.guid,
                    getUpdatedRelationship(relationship),  // Update the relationship correctly
                    ancestors
                  );
                }
              }
            } else {
              console.log('Max depth reached, stopped going deeper.')
            }

            resolve(ancestors);
          } else {
            console.warn(`No data found for profile GUID ${guid}.`);
            resolve(ancestors);
          }
        });
      });
    });
  }

  // Fetch parent's profile by profile ID (use this to get GUID for further recursion)
  async function fetchParentProfileByID(profileId, ancestors = []) {
    console.log(`Fetching profile for parent ID ${profileId}...`);

    await delay(REQUEST_DELAY);
    return retryApiCall(async () => {
      return new Promise((resolve) => {
        Geni.api(`/profile-${profileId}`, async function (response) {
          if (response && response.guid) {
            const parentData = response; // Parent's data, with GUID included in the structure
            console.log(`Fetched parent profile for ID ${profileId}:`, parentData);

            resolve(parentData);  // Return the parent's data (including GUID)
          } else {
            console.warn(`No data found for parent ID ${profileId}.`);
            resolve(null);
          }
        });
      });
    });
  }

  function findMRCA(firstAncestors, secondAncestors) {
    ancestorDepth = 'parent';
    while (true) {
      var atLeastOneInThisLevel = false;
      for (const firstAncestor of firstAncestors) {
        for (const secondAncestor of secondAncestors) {
          if (firstAncestor.relation == ancestorDepth) {
            atLeastOneInThisLevel = true;
            if (firstAncestor.guid == secondAncestor.guid) {
              return [firstAncestor, secondAncestor]; // MRCA 
            }
          }
        }
      }
      getUpdatedRelationship(ancestorDepth);
      if (!atLeastOneInThisLevel) break;
    }
    return null;
  }

  // Function to update the relationship (e.g., from parent to grandparent, etc.)
  function getUpdatedRelationship(currentRelation) {
    if (currentRelation === 'self') return 'parent';
    if (currentRelation === 'parent') return 'grandparent';
    const matches = currentRelation.match(/(\d+)xG grandparent/);
    if (matches) {
      const number = parseInt(matches[1]) + 1;
      return `${number}xG grandparent`;
    }
    return '1xG grandparent';  // Default to 1xG grandparent after parent
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
          const profileGUID = extractProfileGUID(profileUrl.trim());  // Directly using GUID from URL
          console.log(`Extracted Profile GUID: ${profileGUID} from URL: ${profileUrl.trim()}`);

          if (profileGUID) {
            if (localStorage.getItem(profileGUID)) {
              console.log(`Profile ${profileGUID} is already cached, skipping API call.`);
              allAncestors[profileGUID] = JSON.parse(localStorage.getItem(profileGUID));
              continue;  // Skip API call if already cached
            }

            console.log(`Fetching ancestors for Profile GUID: ${profileGUID}`);

            const ancestors = await fetchAncestorsByGUID(profileGUID, 'self');  // Start with "self"

            // Store the ancestors in local storage under the profile's GUID
            localStorage.setItem(profileGUID, JSON.stringify(ancestors));
            //loadFromCache();
            console.log(`Ancestors fetched for Profile GUID ${profileGUID}:`, ancestors);
            allAncestors[profileGUID] = ancestors;
          } else {
            console.error(`Invalid Profile URL: ${profileUrl}`);
          }
        }

        // Output the final results or process further
        console.log("All Ancestors Processed:", allAncestors);

        var results = "";
        for (var i = 0; i < profileUrls.length - 1; i++) {
          const firstProfileGUID = extractProfileGUID(profileUrls[i].trim());
          for (var j = i + 1; j < profileUrls.length; j++) {
            const secondProfileGUID = extractProfileGUID(profileUrls[j].trim());
            if (firstProfileGUID != secondProfileGUID) {
              mrcas = findMRCA(allAncestors[firstProfileGUID], allAncestors[secondProfileGUID]);
              if (mrcas != null) {
                var firstAncestor = allAncestors[firstProfileGUID][0];
                var secondAncestor = allAncestors[secondProfileGUID][0];
                results += `MRCA between <a href="https://www.geni.com/people/x/${firstAncestor.guid}">${firstAncestor.name}</a>`;
                results +=  ` and <a href="https://www.geni.com/people/x/${secondAncestor.guid}">${secondAncestor.name}</a>`;
                results +=  `: <a href="https://www.geni.com/people/x/${mrcas[0].guid}">${mrcas[0].name}</a> (${mrcas[0].relation} & ${mrcas[1].relation})`;
                results += '<br/>';
              }
            }
          }
        }
        document.getElementById('result').innerHTML = results;
      });
    } else {
      alert('Please enter at least two profile URLs');
    }
  });

  // Function to extract the profile GUID from the URL (directly using GUID here)
  function extractProfileGUID(url) {
    const regex = /\/people\/[^\/]+\/(\d+)/;  // Matches GUID in the URL
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1]; // Return the GUID directly from the URL
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
