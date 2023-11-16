const express = require("express");
var path = require("path");
var axios = require("axios");
var FormData = require("form-data");
const { Readable } = require("stream");
// var request = require("request");
var fs = require("fs");
var data = new FormData();
const AWS = require("aws-sdk");
const { isUUID } = require("validator");
const AmazonCognitoIdentity = require("amazon-cognito-identity-js");
const request = require("request-promise");

AWS.config.update({ region: "ca-central-1" });

const userPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: "ca-central-1_hhAt9yhJa",
  ClientId: "7jpndjlhuhjhteq4o7be1bscv8",
});

const formatDistance = (distance) => {
  if (distance < 1) {
    return Math.round(distance * 1000) + " m";
  } else {
    return distance.toFixed(1) + " km";
  }
};

const calculateDistance = (point1, point2) => {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance; // Distance in kilometers
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance; // Distance in kilometers
};

async function reverseGeocode(latitude, longitude) {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json` +
    `?access_token=pk.eyJ1IjoiY29tcHV0ZXJzY2llbmNlYWJib3R0YWJhZCIsImEiOiJja3h6cjkyMHgwZWpxMndtOGt4N3NyZXhzIn0.qG1qpG4c4QvRplh41UnmkQ&limit=1`;

  try {
    const response = await request({ url, json: true });
    if (response.features.length === 0) {
      return null; // Location not found
    }
    return {
      address: response.features[0].place_name,
    };
  } catch (error) {
    throw new Error("Unable to connect to location services!");
  }
}

const updateAddress = async (userId, latitude, longitude, location, prisma) => {
  try {
    // Check if the user already has a current address
    const existingAddress = await prisma.CandidateAddress.findFirst({
      where: {
        candidateAddressTypeId: "2e42c035-a10f-463f-8ca5-a335ed1e504b",
        userId: userId,
        // isCurrent: true,
      },
    });

    // If an existing current address is found, update it
    if (existingAddress) {
      const updatedAddress = await prisma.CandidateAddress.update({
        where: {
          id: existingAddress.id,
        },
        data: {
          latitude: latitude,
          longitude: longitude,
          location: location,
        },
      });

      return updatedAddress;
    }

    // If no existing current address is found, create a new address record
    const newAddress = await prisma.CandidateAddress.create({
      data: {
        userId: userId,
        latitude: latitude,
        longitude: longitude,
        candidateAddressTypeId: "2e42c035-a10f-463f-8ca5-a335ed1e504b",
        // isCurrent: true,
      },
    });

    return newAddress;
  } catch (error) {
    throw new Error("Failed to update user location.");
  }
};

const validateCognitoToken = async (token) => {
  try {
    const tokenVerifier = new AmazonCognitoIdentity.CognitoIdToken({
      IdToken: token,
    });
    const tokenPayload = tokenVerifier.decodePayload();

    if (tokenPayload.exp * 1000 < Date.now()) {
      console.log("Token has expired.");
      return false;
    }

    return tokenPayload.sub; // This is the Cognito user ID (sub) if the token is valid
  } catch (error) {
    console.error("Error validating Cognito token:", error);
    return false; // Return false if token is invalid or there's an error
  }
};

const {
  AuthenticationError,
  ValidationError,
  UserInputError,
  ApolloError,
  ForbiddenError,
  PersistedQueryNotFoundError,
  PersistedQueryNotSupportedError,
} = require("apollo-server-lambda");

const {
  GraphQLUpload,
  graphqlUploadExpress, // A Koa implementation is also exported.
} = require("graphql-upload");
const { KnownFragmentNamesRule } = require("graphql");
const e = require("express");

let ExtensionList = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "tif",
  "webp",
  "bmp",
  "svg",
  "pdf",
  "doc",
  "docx",
  "csv",
  "xlsx",
  "xlsm",
  "xlsb",
  "xltx",
];

const resolvers = {
  Upload: GraphQLUpload,

  Query: {

    SearchSafetyInformation: async (_, { searchString, skip, take }, context) => {
      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);
    

      const name = searchString;
      try {
        // Check if name is null or an empty string
        if (name === null || name === undefined || name.trim() === "") {
          console.log("Wrong search input");
          // return [];
        }
      } catch (error) {
        throw new Error(`Failed to process search: ${error.message}`);
      }
    
      const searchFilters = {
        OR: [
          { name: { contains: name || "", mode: "insensitive" } },
          { description: { contains: name || "", mode: "insensitive" } },
        ],
      };
    
      const matchingSafetyInformation = await context.prisma.safetyInformation.findMany({
        where: searchFilters,
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          name: 'asc', // Order by name alphabetically
        },
      });
    
      return matchingSafetyInformation.map((safety) => ({
        id: safety.id,
        name: safety.name,
        description: safety.description,
        createdAt: safety.createdAt,
        updatedAt: safety.updatedAt,
      }));
    },

    ReverseGeocode: async (parent, args, context) => {
      const { latitude, longitude } = args;

      const reverseGeocode = (lat, lon, callback) => {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
          `?access_token=pk.eyJ1IjoiY29tcHV0ZXJzY2llbmNlYWJib3R0YWJhZCIsImEiOiJja3h6cjkyMHgwZWpxMndtOGt4N3NyZXhzIn0.qG1qpG4c4QvRplh41UnmkQ&limit=1`;

        request({ url, json: true }, (error, { body }) => {
          if (error) {
            callback("Unable to connect to location services!", undefined);
          } else if (body.features.length === 0) {
            callback(
              "Unable to find location for the given coordinates.",
              undefined
            );
          } else {
            callback(undefined, {
              address: body.features[0].place_name,
            });
          }
        });
      };

      return new Promise((resolve) => {
        reverseGeocode(latitude, longitude, (error, { address } = {}) => {
          if (error) {
            resolve({ error });
          } else {
            resolve({
              address,
            });
          }
        });
      });
    },
  

    addressList: async (parent, args, context) => {
      const { address } = args;

      let _location = [];

      function timeout() {
        return new Promise((resolve) => {
          const geocode = (address, callback) => {
            const url =
              "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
              address +
              ".json?access_token=pk.eyJ1IjoiY29tcHV0ZXJzY2llbmNlYWJib3R0YWJhZCIsImEiOiJja3h6cjkyMHgwZWpxMndtOGt4N3NyZXhzIn0.qG1qpG4c4QvRplh41UnmkQ&limit=5";

            request({ url, json: true }, (error, { body }) => {
              if (error) {
                callback("Unable to connect to location services!", undefined);
              } else if (body.features.length === 0) {
                callback(
                  "Unable to find location. Try another search.",
                  undefined
                );
              } else {
                callback(undefined, {
                  location: body.features,
                });
              }
            });
          };

          geocode(address, (error, { location } = {}) => {
            if (error) {
              //return res.send({ error });
              resolve();
            }

            for (let i = 0; i < location.length; ++i) {
              _location.push(location[i].place_name);
            }

            // console.log(_location);

            resolve();
          });
        });
      }

      await timeout();

      return _location;
    },

    PaidAdvertisements: async (_, args, context) => {
      return [
        "https://corptechsolutions.s3.amazonaws.com/Group+9481.png",
        "https://corptechsolutions.s3.amazonaws.com/Group+9482.png",
      ];
    },
    GetDashboardStatistics: async (_, args, context) => {
      return {
        shortTimeJobsCount: "44.5K",
        fullTimeJobsCount: "66.8K",
        partTimeJobsCount: "38.9K",
      };
    },
    GetProvinces: async (_, { country }, context) => {
      if (country.toLowerCase() !== "canada") {
        return []; // Return an empty array for non-Canada countries
      }
      const provinces = await context.prisma.canadacities.findMany({
        distinct: ["province_name"],
        select: { province_name: true },
      });
      return provinces.map((province) => province.province_name);
    },
    GetCities: async (_, { country, province }, context) => {
      if (country.toLowerCase() !== "canada") {
        return []; // Return an empty array for non-Canada countries
      }
      const cities = await context.prisma.canadacities.findMany({
        where: { province_name: province },
        select: { city_ascii: true },
        distinct: ["city_ascii"], // Ensure distinct city names
      });
      return cities.map((city) => city.city_ascii);
    },

    GetDropdownData: async (parent, args) => {
      const { country, province, city, state, location } = args;
      const query = [location, city, state, province, country]
        .filter(Boolean)
        .join(", ");

      if (!query) {
        return {
          locations: [],
          cities: [],
          states: [],
          provinces: [],
          countries: [],
        };
      }

      const locations = await geocodeLocation(query);
      const cities = await geocodeLocation(`${city}, ${province}, ${country}`);
      const states = await geocodeLocation(`${state}, ${country}`);
      const provinces = await geocodeLocation(`${province}, ${country}`);
      const countries = await geocodeLocation(country);

      return {
        locations,
        cities,
        states,
        provinces,
        countries,
      };
    },
    DropdownJobCategories: async (_, { searchString, skip, take }, context) => {
      // Validate and sanitize skip and take values
      if (take <= 0) {
        return [];
      }
      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      try {
        // Check if at least one argument is provided
        if (!searchString) {
          return [];
        }

        if (searchString === "") {
          return [];
        }
      } catch (error) {
        throw new Error(`Failed to fetch job categories: ${error.message}`);
      }

      const searchFilters = {
        name: { contains: searchString || "", mode: "insensitive" },
      };

      const jobCategories = await context.prisma.jobCategory.findMany({
        where: searchFilters,
        select: {
          id: true, // Select both id and name fields
          name: true,
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          name: "asc", // Order categories alphabetically by name
        },
      });

      // You can directly return the jobCategories array, which now contains objects with id and name.
      return jobCategories;
    },

    DropdownTransportations: async (_, { skip, take }, context) => {
      try {
        // Validate and sanitize skip and take values
        if (take <= 0) {
          return [];
        }
        const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
        const sanitizedTake = Math.max(0, parseInt(take) || 10);

        const transportations = await context.prisma.transportation.findMany({
          select: {
            id: true,
            name: true,
          },
          skip: sanitizedSkip,
          take: sanitizedTake,
          orderBy: {
            name: "asc", // Order by the name field in ascending order
          },
        });

        return transportations;
      } catch (error) {
        console.error("Error fetching transportation options:", error);
        throw new Error("Could not fetch transportation options.");
      }
    },

    DropdownWorkHoursTypes: async (_, { skip, take }, context) => {
      try {
        // Validate and sanitize skip and take values
        if (take <= 0) {
          return [];
        }
        const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
        const sanitizedTake = Math.max(0, parseInt(take) || 5);

        const workHoursTypes = await context.prisma.workHoursType.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc", // Order by the name field in ascending order
          },
          skip: sanitizedSkip,
          take: sanitizedTake,
        });

        return workHoursTypes;
      } catch (error) {
        console.error("Error fetching work hours types:", error);
        throw new Error("Could not fetch work hours types.");
      }
    },

    PersonalInformationCompletion: async (_, args, context) => {
      const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";
      let filledFields = 0;
      try {
        // Fetch the user and related records
        const user = await context.prisma.user.findUnique({
          where: { id: userId },
          include: {
            candidatePhone: true,
            candidateAddress: {
              where: {
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            },
          },
        });

        for (let i = 0; i < user.candidatePhone.length; ++i) {
          if (
            user.candidatePhone[i].candidatePhoneTypeId ===
            "a91144a1-8e5a-4b84-8f94-bf06f1152a1c"
          ) {
            console.log("Personal Phone Fields exists");
            filledFields++;
          }
        }

        for (let i = 0; i < user.candidatePhone.length; ++i) {
          if (
            user.candidatePhone[i].candidatePhoneTypeId ===
            "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e"
          ) {
            console.log("Emergency Phone Fields exists");
            filledFields++;
          }
        }

        // if (totalPersonalPhoneFields > 0) {
        //   console.log("PersonalPhoneFields exists!");
        //   filledFields++;
        // }

        // if (totalEmergencyPhoneFields > 0) {
        //   console.log("EmergencyPhoneFields exists!");
        //   filledFields++;
        // }

        // Count the number of filled fields for other user information

        if (user.firstName && user.firstName.trim() !== "") {
          filledFields++;
          console.log("User firstName exists!");
        }
        // if (user.lastName && user.lastName.trim() !== "") filledFields++;
        // if (user.middleName && user.middleName.trim() !== "") filledFields++;
        if (user.dateOfBirth) {
          filledFields++;
          console.log("Date of birth exists!");
        }

        if (
          user.candidateAddress.length > 0 &&
          user.candidateAddress[0].location
        ) {
          filledFields++;
          console.log("Address exists!");
        }
        // Calculate the total completion percentage
        const totalFields = 5; // Total number of fields

        // const personalAndEmergencyPhoneTotalPercentage =
        //   (personalPhoneCompletionPercentage +
        //     emergencyPhoneCompletionPercentage) /
        //   2;

        console.log("filled fileds: ", filledFields);

        console.log("total fileds: ", totalFields);

        const completionPercentage = Math.floor(
          (filledFields / totalFields) * 100
        );

        return {
          percentageInt: completionPercentage,
          percentageString: completionPercentage + "" + "%",
        };
      } catch (error) {
        throw error;
      }
    },

    WorkInformationCompletion: async (_, args, context) => {
      const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";
      // let filledFields = 0;
      // try {
      //   // Fetch the user and related records
      //   const user = await context.prisma.user.findUnique({
      //     where: { id: userId },
      //     include: {
      //       candidatePhone: true,
      //       candidateAddress: {
      //         where: {
      //           candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
      //         },
      //       },
      //     },
      //   });

      //   for (let i = 0; i < user.candidatePhone.length; ++i) {
      //     if (
      //       user.candidatePhone[i].candidatePhoneTypeId ===
      //       "a91144a1-8e5a-4b84-8f94-bf06f1152a1c"
      //     ) {
      //       console.log("Personal Phone Fields exists");
      //       filledFields++;
      //     }
      //   }

      //   for (let i = 0; i < user.candidatePhone.length; ++i) {
      //     if (
      //       user.candidatePhone[i].candidatePhoneTypeId ===
      //       "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e"
      //     ) {
      //       console.log("Emergency Phone Fields exists");
      //       filledFields++;
      //     }
      //   }

      //   // if (totalPersonalPhoneFields > 0) {
      //   //   console.log("PersonalPhoneFields exists!");
      //   //   filledFields++;
      //   // }

      //   // if (totalEmergencyPhoneFields > 0) {
      //   //   console.log("EmergencyPhoneFields exists!");
      //   //   filledFields++;
      //   // }

      //   // Count the number of filled fields for other user information

      //   if (user.firstName && user.firstName.trim() !== "") {
      //     filledFields++;
      //     console.log("User firstName exists!");
      //   }
      //   // if (user.lastName && user.lastName.trim() !== "") filledFields++;
      //   // if (user.middleName && user.middleName.trim() !== "") filledFields++;
      //   if (user.dateOfBirth) {
      //     filledFields++;
      //     console.log("Date of birth exists!");
      //   }

      //   if (
      //     user.candidateAddress.length > 0 &&
      //     user.candidateAddress[0].location
      //   ) {
      //     filledFields++;
      //     console.log("Address exists!");
      //   }
      //   // Calculate the total completion percentage
      //   const totalFields = 5; // Total number of fields

      //   // const personalAndEmergencyPhoneTotalPercentage =
      //   //   (personalPhoneCompletionPercentage +
      //   //     emergencyPhoneCompletionPercentage) /
      //   //   2;

      //   console.log("filled fileds: ", filledFields);

      //   console.log("total fileds: ", totalFields);

      //   const completionPercentage = Math.floor(
      //     (filledFields / totalFields) * 100
      //   );

      return {
        percentageInt: 80,
        percentageString: 80 + "" + "%",
      };
      // } catch (error) {
      //   throw error;
      // }
    },

    SearchAddresses: async (parent, args, context) => {
      const { address } = args;

      let _location = [];

      function timeout() {
        return new Promise((resolve) => {
          const geocode = (address, callback) => {
            const url =
              "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
              address +
              ".json?access_token=pk.eyJ1IjoiY29tcHV0ZXJzY2llbmNlYWJib3R0YWJhZCIsImEiOiJja3h6cjkyMHgwZWpxMndtOGt4N3NyZXhzIn0.qG1qpG4c4QvRplh41UnmkQ&limit=5";

            request({ url, json: true }, (error, { body }) => {
              if (error) {
                callback("Unable to connect to location services!", undefined);
              } else if (body.features.length === 0) {
                callback(
                  "Unable to find location. Try another search.",
                  undefined
                );
              } else {
                callback(undefined, {
                  location: body.features,
                });
              }
            });
          };

          geocode(address, (error, { location } = {}) => {
            if (error) {
              //return res.send({ error });
              resolve();
            }

            for (let i = 0; i < location.length; ++i) {
              _location.push(location[i].place_name);
            }

            // console.log(_location);

            resolve();
          });
        });
      }

      await timeout();

      return _location;
    },

    GetUserLocation: async (parent, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        const userAddress = await context.prisma.address.findFirst({
          where: {
            userId: userId,
            isCurrent: true,
          },
        });

        if (!userAddress) {
          return { success: false, message: "User location not found." };
        }

        return {
          success: true,
          latitude: userAddress.latitude,
          longitude: userAddress.longitude,
          location: userAddress.location,
        };
      } catch (error) {
        console.error("Error getting user location:", error);
        return { success: false, raw: error };
      }
    },
    _ReverseGeocode: async (parent, args, context) => {
      const { latitude, longitude } = args;

      try {
        const result = await reverseGeocode(latitude, longitude);
        if (result === null) {
          return {
            error: "Unable to find location for the given coordinates.",
          };
        }
        return { address: result.address };
      } catch (error) {
        return { error: error.message };
      }
    },
    IsAlreadyApplied: async (_, { jobId }, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        // Check if the job exists
        const jobExists = await context.prisma.job.findUnique({
          where: {
            id: jobId,
          },
        });

        if (!jobExists) {
          return { success: false, message: "Job not found" };
        }

        // Check if the user has already applied to this job
        const existingApplication =
          await context.prisma.jobApplication.findFirst({
            where: {
              jobId: jobId,
              candidateId: userId,
            },
          });

        if (existingApplication) {
          return { success: false, message: "Already applied to this job" };
        }

        return { success: true, message: "Not applied to this job yet" };
      } catch (error) {
        console.error("Error checking job application:", error);
        return { success: false, message: "An error occurred" };
      }
    },
    _GetLocationInfo: async (_, { latitude, longitude }) => {
      const token =
        "eyJraWQiOiJ2dis1cFY5akVhYjFoRms1ckUrUGZ2S3U1MFdJRVFheU5GZmxcL1p3SFA1az0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI2ZjkxMjMzMS05ZTFiLTQ4ZTYtOWViNy1lZWQyNjY2MmJjZmMiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuY2EtY2VudHJhbC0xLmFtYXpvbmF3cy5jb21cL2NhLWNlbnRyYWwtMV9oaEF0OXloSmEiLCJjbGllbnRfaWQiOiI3anBuZGpsaHVoamh0ZXE0bzdiZTFic2N2OCIsIm9yaWdpbl9qdGkiOiIyYTdhODIxYS02OWVhLTQxMDctYmRkMS1mNDVjZDEwMjhkZGUiLCJldmVudF9pZCI6IjcwNGRmMjNmLTlmMWYtNGVmOC1iYmZjLWZhNDljMmZjYjI2ZiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE2OTI3NTk2ODcsImV4cCI6MTY5Mjc2MzI4NiwiaWF0IjoxNjkyNzU5Njg3LCJqdGkiOiI4MGNhNjhmZC0yNzg2LTQzMjUtYTNiMi03YTJlZTg0ZTA0NzkiLCJ1c2VybmFtZSI6IjZmOTEyMzMxLTllMWItNDhlNi05ZWI3LWVlZDI2NjYyYmNmYyJ9.VT1reBrL1WrS9NvedPlY8QgcR1shzFdB1Ld_leqU-mdmmpFulB0JHBkaxnNpqcWJ_aC10L-fBi45bXCxRm81KlHZYe6j3eIbg40mGKu14iu3qgONDu8kUTynX1atoEGowZkT81XD7cbnSjDU-lZIoWq61L0dofcIVBUYGNMPj_HIb-dA5yADtTEZ4LeogXxEfnRqCrNRwV2QK9KScYrbLqSHK6nbSPzNiplIiaX8qpZtr9sfPHY5AXXU76HCKLhktkwonA17ISSXGilAZKo6HloPKJEQUyLqMS_3Wq5vsbZQLY9js4snzJ63tUESavVomEnVtGHNpVKrJvh0j2Q2Hg";

      try {
        const userId = await validateCognitoToken(token);

        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
        }
      } catch (error) {
        console.error("An error occurred:", error);
      }

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=pk.eyJ1IjoiY29tcHV0ZXJzY2llbmNlYWJib3R0YWJhZCIsImEiOiJja3h6cjkyMHgwZWpxMndtOGt4N3NyZXhzIn0.qG1qpG4c4QvRplh41UnmkQ&limit=1`;

      return new Promise((resolve) => {
        request({ url, json: true }, (error, { body }) => {
          if (error || body.features.length === 0) {
            resolve({
              country: "Location not found",
              city: "Location not found",
              province: "Location not found",
            });
          } else {
            let country = "";
            let city = "";
            let province = "";

            // Loop through the context array to find country, city, and province
            body.features[0].context.forEach((context) => {
              if (context.id.startsWith("country")) {
                country = context.text;
              } else if (context.id.startsWith("place")) {
                city = context.text;
              } else if (context.id.startsWith("region")) {
                province = context.text;
              }
            });

            resolve({
              country,
              city,
              province,
            });
          }
        });
      });
    },

    GetTotalBookmarkedJobCount: async (parent, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186"; // Replace with the actual user's ID

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        // Fetch the count of bookmarked jobs associated with the user
        const totalBookmarkedJobs = await context.prisma.bookmark.count({
          where: {
            userId,
          },
        });

        return totalBookmarkedJobs;
      } catch (error) {
        console.error("Error fetching total bookmarked job count:", error);
        throw new Error("Could not fetch total bookmarked job count.");
      }
    },
    GetTotalAppliedJobCount: async (parent, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        // Fetch the count of job applications associated with the user
        const totalAppliedJobs = await context.prisma.jobApplication.count({
          where: {
            candidateId: userId,
          },
        });

        return totalAppliedJobs;
      } catch (error) {
        console.error("Error fetching total applied job count:", error);
        throw new Error("Could not fetch total applied job count.");
      }
    },

    DropdownJobStatuses: async (_, __, context) => {
      try {
        const jobStatuses = await context.prisma.jobStatus.findMany({
          select: {
            id: true,
            name: true,
            description: true,
            orderBy: true,
          },
          orderBy: {
            orderBy: "asc",
          },
        });

        return jobStatuses;
      } catch (error) {
        console.error("Error fetching job statuses:", error);
        throw new Error("Could not fetch job statuses.");
      }
    },

    DropdownApplicationJobStatuses: async (_, __, context) => {
      try {
        const applicationStatuses =
          await context.prisma.applicationStatus.findMany({
            select: {
              id: true,
              name: true,
              description: true,
              orderBy: true,
            },
            orderBy: {
              orderBy: "asc",
            },
          });

        return applicationStatuses;
      } catch (error) {
        console.error("Error fetching application statuses:", error);
        throw new Error("Could not fetch application statuses.");
      }
    },

    // GetUserBookmarkedFilters: async (parent, args, context) => {
    //   const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

    //   try {
    //     // Get all bookmarked jobs of the user
    //     const userBookmarks = await context.prisma.bookmark.findMany({
    //       where: {
    //         userId: userId,
    //       },
    //       include: {
    //         job: {
    //           include: {
    //             skills: true,
    //             tags: true,
    //             status: true,
    //             category: true,
    //             jobApplications: {
    //               include: {
    //                 status: true,
    //               },
    //             },
    //           },
    //         },
    //       },
    //     });

    //     const uniqueSkills = new Set();
    //     const uniqueTags = new Set();
    //     const uniqueStatuses = new Set();
    //     const uniqueCategories = new Set();
    //     const uniqueApplicationStatuses = new Set();

    //     userBookmarks.forEach((bookmark) => {
    //       bookmark.job.skills.forEach((skill) => uniqueSkills.add(skill.name));
    //       bookmark.job.tags.forEach((tag) => uniqueTags.add(tag.name));
    //       uniqueStatuses.add(bookmark.job.status.name);
    //       uniqueCategories.add(bookmark.job.category.name);
    //       bookmark.job.jobApplications.forEach((application) =>
    //         uniqueApplicationStatuses.add(application.status.name)
    //       );
    //     });

    //     const skills = Array.from(uniqueSkills);
    //     const tags = Array.from(uniqueTags);
    //     const statuses = Array.from(uniqueStatuses);
    //     const categories = Array.from(uniqueCategories);
    //     const applicationStatuses = Array.from(uniqueApplicationStatuses);

    //     return {
    //       skills,
    //       tags,
    //       statuses,
    //       categories,
    //       applicationStatuses,
    //     };
    //   } catch (error) {
    //     console.error("Error fetching user's bookmarked filters:", error);
    //     throw new Error("Could not fetch user's bookmarked filters");
    //   }
    // },

    GetBookmarkedJobs: async (_, { jobStatusId, skip, take }, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      if (jobStatusId && !isUUID(jobStatusId)) {
        throw new Error("Invalid jobStatusId format.");
      }

      try {
        let whereClause = {
          bookmarks: {
            some: {
              userId: userId,
            },
          },
        };

        if (jobStatusId !== "44779d61-6039-6c2b-2b01-38f68329d617") {
          whereClause.statusId = jobStatusId;
        }

        const bookmarkedJobs = await context.prisma.job.findMany({
          where: whereClause,
          include: {
            organization: true,
            status: true,
            address: true,
            category: true,
            jobType: true,
            bookmarks: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            skills: true,
          },
          // Apply pagination
          skip: skip || 0,
          take: take || 10,
          // Order the results in reverse chronological order based on 'createdAt'
          orderBy: {
            createdAt: "desc",
          },
        });

        return bookmarkedJobs;
      } catch (error) {
        console.error("Error fetching bookmarked jobs:", error);
        throw new Error("Could not fetch bookmarked jobs.");
      }
    },

    GetAppliedJobs: async (parent, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      // Extract the filter parameters from the args object
      const { applicationStatusId, skip, take } = args;

      if (applicationStatusId && !isUUID(applicationStatusId)) {
        throw new Error("Invalid applicationStatusId format.");
      }

      try {
        // Step 1: Build the filter conditions for the job applications query
        const where = {
          candidateId: userId,
        };

        // Apply filters based on input parameters
        if (
          applicationStatusId &&
          applicationStatusId !== "22d6c0b4-a772-2980-71e6-df5bcdf43802"
        ) {
          where.statusId = applicationStatusId;
        }

        // Step 2: Fetch JobApplication records for the user with applied filters
        const jobApplications = await context.prisma.jobApplication.findMany({
          where,
          include: {
            status: true,
            candidate: true,
            job: {
              include: {
                organization: true,
                status: true,
                address: true,
                category: true,
                tags: true,
                jobLevel: true,
                jobType: true,
                bookmarks: true,
                skills: true,
                jobApplications: {
                  include: {
                    status: true,
                  },
                },
                jobDocuments: {
                  include: {
                    document: true,
                  },
                },
              },
            },
          },
          skip: skip || 0,
          take: take || 10,
          orderBy: {
            updatedAt: "desc",
          },
        });

        return jobApplications;
      } catch (error) {
        console.error(`Error fetching applied jobs for user ${userId}:`, error);
        throw new Error("Could not fetch applied jobs");
      }
    },

    _GetJobs: async (parent, args, context) => {
      try {
        console.log("Fetching jobs...");

        // Extract the pagination parameters from the args
        const { skip, take } = args;

        const jobs = await context.prisma.job.findMany({
          // Apply pagination with skip and take
          skip: skip || 0,
          take: take || 10, // Set a default value for take if not provided

          // Sort jobs in reverse chronological order by "createdAt"
          orderBy: {
            createdAt: "desc",
          },

          // Include related data
          include: {
            organization: true,
            status: true,
            bookmarks: true,
            address: true,
            category: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            jobType: true,
            skills: true,
          },
        });

        // Filter jobs to exclude those with status "17571ecf-5ec5-4dea-8fd4-45ee61cb180d"
        const filteredJobs = jobs.filter(
          (job) => job.status.id !== "17571ecf-5ec5-4dea-8fd4-45ee61cb180d"
        );

        // Convert DateTime values to ISO 8601 strings before returning the response
        const jobsWithFormattedDates = filteredJobs.map((job) => ({
          ...job,
          startDate: job.startDate?.toISOString() || null,
          endDate: job.endDate?.toISOString() || null,
          createdAt: job.createdAt?.toISOString() || null,
          updatedAt: job.updatedAt?.toISOString() || null,
          appliedAt: job.appliedAt?.toISOString() || null,
        }));

        return jobsWithFormattedDates;
      } catch (error) {
        console.error("Error fetching jobs:", error);
        throw new Error("Could not fetch jobs");
      }
    },
    GetJobById: async (parent, args, context) => {
      console.log(context.token);
      try {
        // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

        console.log("----------------------------------------------");
        let userId = null;

        userId = await validateCognitoToken(context.token);
        try {
          if (userId) {
            console.log("Token is valid. User ID:", userId);
          } else {
            console.log("Token is invalid or expired.");
            throw new Error("Invalid token!");
          }
        } catch (error) {
          console.error("An error occurred:", error);
          throw new Error("Invalid token!", error);
        }
        console.log("----------------------------------------------");

        const { id } = args;

        console.log(`Fetching job for incident with ID ${id}...`);

        // Find the incident with the given ID
        const incident = await context.prisma.job.findUnique({
          where: { id },
          include: {
            organization: true,
            status: true,
            address: true,
            category: true,
            bookmarks: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            jobType: true,
            skills: true,
          },
        });

        // Check if the incident is associated with a job
        if (!incident) {
          return null; // Return null if no job is associated with the incident
        }

        // Check if the job ID exists in the Bookmark table for the specific user
        const isBookmarked = await context.prisma.bookmark.findMany({
          where: {
            userId: userId,
            jobId: id,
          },
        });

        let jobIsBookmarked = false;
        if (isBookmarked.length > 0) {
          jobIsBookmarked = true;
        }

        // Check if the user has already viewed this job
        const existingView = await context.prisma.recentJobView.findFirst({
          where: {
            userId: userId,
            jobId: id,
          },
          orderBy: {
            viewedAt: "desc", // Get the latest view
          },
        });

        // If an existing view exists, update the timestamp
        if (existingView) {
          await context.prisma.recentJobView.update({
            where: {
              id: existingView.id,
            },
            data: {
              viewedAt: new Date(), // Update the timestamp to the current time
            },
          });
        } else {
          // If no existing view, create a new view record
          await context.prisma.recentJobView.create({
            data: {
              userId: userId,
              jobId: id,
            },
          });
        }

        // Convert DateTime values to ISO 8601 strings before returning the response
        const jobWithFormattedDates = {
          ...incident.job,
          isBookmarked: jobIsBookmarked, // Add the isBookmarked field
          // startDate: incident.job.startDate?.toISOString() || null,
          // endDate: incident.job.endDate?.toISOString() || null,
          // createdAt: incident.job.createdAt?.toISOString() || null,
          // updatedAt: incident.job.updatedAt?.toISOString() || null,
          // appliedAt: incident.job.appliedAt?.toISOString() || null,
        };

        incident.isBookmarked = jobIsBookmarked;

        return incident;
      } catch (error) {
        console.error("Error fetching job by incident ID:", error);
        throw new Error("Could not fetch job by incident ID");
      }
    },

    RecentJobViews: async (_, { skip, take }, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      try {
        // Delete older records if there are more than 10 records
        const totalRecords = await context.prisma.recentJobView.count();
        const recordsToDelete = Math.max(0, totalRecords - 3);
        if (recordsToDelete > 0) {
          const oldestRecords = await context.prisma.recentJobView.findMany({
            orderBy: { viewedAt: "asc" },
            take: recordsToDelete,
          });
          const deletePromises = oldestRecords.map((record) =>
            context.prisma.recentJobView.delete({
              where: { id: record.id },
            })
          );
          await Promise.all(deletePromises);
        }

        // Retrieve the recent job views
        const recentJobViews = await context.prisma.recentJobView.findMany({
          where: { userId: userId },
          orderBy: { viewedAt: "desc" },
          skip: sanitizedSkip,
          take: sanitizedTake,
          include: {
            job: {
              include: {
                organization: true,
                status: true,
                address: true,
                category: true,
                tags: true,
                jobDocuments: {
                  include: {
                    document: true,
                  },
                },
                jobApplications: {
                  include: {
                    candidate: true,
                    status: true,
                  },
                },
                jobLevel: true,
                jobType: true,
                skills: true,
              },
            },
          },
        });

        // console.log(recentJobViews);

        return recentJobViews.map((view) => view.job);
      } catch (error) {
        console.error("Error retrieving recent job views:", error);
        throw new Error("Could not retrieve recent job views");
      }
    },

    GetUserProfile: async (parent, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        const user = await context.prisma.user.findUnique({
          where: {
            id: userId,
          },
          include: {
            businessContactInfos:{
include:{
  email: true,
  phone: true,
  address: true
}
            },


            personalContactInfos:{
              include:{
                email: true,
                phone: true,
                address: true
              }
                  },




                  workExperiences:true,
                  educations: true,


                  candidateSafetyInformations:{
                    include:{
                      safetyInformation: true,
                    }
                        },




            candidateDocuments: {
              include: {
                candidateDocumentType: true,
              },
            },
            candidateAddress: {
              include: {
                candidateAddressType: true,
              },
            },
            // candidateAddress: {
            //   include: {
            //     candidateAddressType: true,
            //   },
            // },
            candidatePreference: {
              include: {
                transportation: true,
                workHoursType: true,
                jobCategories: {
                  include: { jobCategory: true },
                },
              },
            },

            candidatePhone: {
              include: {
                candidatePhonetype: true,
              },
            },
            // candidatePreference: true,
            role: true,
            userFeatures: true,
            userPlan: true,
            userPlanFeatures: true,
            emails: true,
            phones: true,
            designation: true,
            tags: true,
            addresses: true,
            userSessions: true,
            // userPreference: true,
            bookmarks: {
              include: {
                job: true,
              },
            },
            // jobs: {
            //   include: {
            //     organization: true,
            //     status: true,
            //     address: true,
            //     category: {
            //       include: {
            //         jobCategory: true,
            //       },
            //     },
            //     tags: true,
            //     jobDocuments: {
            //       include: {
            //         document: true,
            //       },
            //     },
            //     jobApplications: {
            //       include: {
            //         candidate: true,
            //         status: true,
            //       },
            //     },
            //     jobLevel: true,
            //     skills: true,
            //   },
            // },
            // jobApplications: {
            //   include: {
            //     job: true,
            //     status: true,
            //     candidate: true,
            //   },
            // },
            // userDocuments: {
            //   include: {
            //     document: {
            //       include: {
            //         category: true,
            //       },
            //     },
            //   },
            // },
          },
        });

        // PersonalInformationCompletion: Int;
        // WorkInformationCompletion: Int;
        // DocumentsCompletion: Int;

        //
        //------------------Calculate Personal Information Completion calculation


          // Sort the 'businessContactInfos' and 'personalContactInfos' arrays in JavaScript
  user.businessContactInfos.sort((a, b) => {
    if (a.isCurrent === b.isCurrent) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return b.isCurrent - a.isCurrent;
  });

  user.personalContactInfos.sort((a, b) => {
    if (a.isCurrent === b.isCurrent) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return b.isCurrent - a.isCurrent;
  });


        let filledFields = 0;

        // Fetch the user and related records
        const _user = await context.prisma.user.findUnique({
          where: { id: userId },
          include: {
            candidatePhone: true,
            candidateAddress: {
              where: {
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            },
          },
        });

        // console.log("=======================================");

        // console.log(_user);

        // console.log("=======================================");
        if (_user.candidatePhone.length > 0) {
          for (let i = 0; i < _user.candidatePhone.length; ++i) {
            if (
              _user.candidatePhone[i].candidatePhoneTypeId ===
              "a91144a1-8e5a-4b84-8f94-bf06f1152a1c"
            ) {
              console.log("Personal Phone Fields exists");
              filledFields++;
            }
          }

          for (let i = 0; i < _user.candidatePhone.length; ++i) {
            if (
              _user.candidatePhone[i].candidatePhoneTypeId ===
              "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e"
            ) {
              console.log("Emergency Phone Fields exists");
              filledFields++;
            }
          }
        }

        // if (totalPersonalPhoneFields > 0) {
        //   console.log("PersonalPhoneFields exists!");
        //   filledFields++;
        // }

        // if (totalEmergencyPhoneFields > 0) {
        //   console.log("EmergencyPhoneFields exists!");
        //   filledFields++;
        // }

        // Count the number of filled fields for other user information

        if (_user.firstName && _user.firstName.trim() !== "") {
          filledFields++;
          console.log("User firstName exists!");
        }
        // if (user.lastName && user.lastName.trim() !== "") filledFields++;
        // if (user.middleName && user.middleName.trim() !== "") filledFields++;
        if (_user.dateOfBirth) {
          filledFields++;
          console.log("Date of birth exists!");
        }

        if (
          _user.candidateAddress.length > 0 &&
          _user.candidateAddress[0].location
        ) {
          filledFields++;
          console.log("Address exists!");
        }
        // Calculate the total completion percentage
        const totalFields = 5; // Total number of fields

        // const personalAndEmergencyPhoneTotalPercentage =
        //   (personalPhoneCompletionPercentage +
        //     emergencyPhoneCompletionPercentage) /
        //   2;

        console.log("filled fileds: ", filledFields);

        console.log("total fileds: ", totalFields);

        const completionPercentage = Math.floor(
          (filledFields / totalFields) * 100
        );
        //------------------End Personal Information Completion calculation

        user.PersonalInformationCompletion = completionPercentage;
        user.WorkInformationCompletion = 80;
        user.DocumentsCompletion = 80;
        user.TotalProfileCompletion = 95;

        user.name =
          user.firstName +
          (user.middleName && user.middleName.trim() !== ""
            ? " " + user.middleName
            : "") +
          (user.lastName && user.lastName.trim() !== ""
            ? " " + user.lastName
            : "");

        if (user.name === "null") {
          user.name = null;
        }

        return user;
      } catch (error) {
        console.error("Error fetching user profile:", error);
        throw new Error("Could not fetch user profile");
      }
    },

    DropdownJobLevels: async (_, __, context) => {
      const jobLevels = await context.prisma.jobLevel.findMany({
        orderBy: { orderBy: "asc" }, // Order by the orderby field
      });
      return jobLevels;
    },

    DropdownJobTypes: async (_, __, context) => {
      const jobTypes = await context.prisma.jobType.findMany({
        orderBy: { orderBy: "asc" }, // Order by the orderby field
      });
      return jobTypes;
    },

    NearbyJobs: async (_, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      const { skip, take } = args;

      try {
        const userResult = await context.prisma.user.findUnique({
          where: { id: userId },
          include: {
            addresses: {
              where: { isCurrent: true },
            },
            candidateAddress: true,
            candidatePreference: true,
          },
        });

        console.log(userResult);
        let userLatitude = userResult.addresses[0].latitude;
        let userLongitude = userResult.addresses[0].longitude;

        console.log(userLatitude);
        console.log(userLongitude);
        let LocationPreference = null;
        let isSearchByCity = false;
        let city = null;

        // 2e42c035-a10f-463f-8ca5-a335ed1e504b       My Current Location
        // 7d49edb5-ea56-42f4-a21a-c182c851afdf       Near My Address
        // ecd2af27-3783-42ff-93b5-81568d205ae6       Work In a Particular City

        if (userResult.length === 0) {
          throw new Error("User not found.");
        }

        if (userResult.candidatePreference.isCurrentLocationDefault) {
          console.log("Current Location");
          LocationPreference = "2e42c035-a10f-463f-8ca5-a335ed1e504b";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              console.log("true");
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;

              console.log(userResult.candidateAddress[i].latitude);
            }
          }
        } else if (userResult.candidatePreference.isNearMyAddressDefault) {
          console.log("Near My Address");
          LocationPreference = "7d49edb5-ea56-42f4-a21a-c182c851afdf";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;
            }
          }
        } else if (userResult.candidatePreference.isWorkInCityDefault) {
          console.log("Work In a Particular City");
          LocationPreference = "ecd2af27-3783-42ff-93b5-81568d205ae6";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              isSearchByCity = true;
              city = userResult.candidateAddress[i].city;
            }
          }
        } else {
          console.log("User Preference is not set for user: ", userId);
        }

        console.log("---------------------------------------");
        console.log(userLatitude);
        console.log(userLongitude);

        const query = `
        SELECT "Job".id, "Job".title, "Job".description, "Address".latitude, "Address".longitude,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) AS distance_meters,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) / 1000 AS distance_kilometers
        FROM "Job"
        INNER JOIN "Address" ON "Job".id = "Address"."jobId"
        WHERE ST_DWithin(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography,
          500000000
        )
        AND "Job"."statusId" != '5ac89c4d-7587-4e2d-8227-6df4e943fb18' -- Exclude specific status ID
        ORDER BY ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        )
        LIMIT ${take} OFFSET ${skip}`;

        const result = await context.prisma.$queryRawUnsafe(query);

        // Extract the job IDs, distance in meters, and distance in kilometers from the result
        const jobsWithDistances = result.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          latitude: row.latitude,
          longitude: row.longitude,
          distance_meters: row.distance_meters,
          distance_kilometers: row.distance_kilometers,
        }));

        // Fetch full job details using findMany
        const jobs = await context.prisma.job.findMany({
          where: {
            id: {
              in: jobsWithDistances.map((job) => job.id), // Filter jobs by the retrieved IDs
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            organization: true,
            status: true,
            address: true,
            category: true,
            bookmarks: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            jobType: true,
            skills: true,
          },
        });

        const jobIds = jobsWithDistances.map((job) => job.id);

        const bookmarkedJobs = await context.prisma.bookmark.findMany({
          where: {
            userId,
            jobId: {
              in: jobIds,
            },
          },
          select: {
            jobId: true,
          },
        });

        const bookmarkedJobIds = bookmarkedJobs.map(
          (bookmark) => bookmark.jobId
        );

        const jobsWithFormattedDetails = jobsWithDistances.map(
          (jobWithDistance) => {
            const job = jobs.find((j) => j.id === jobWithDistance.id);
            if (!job) {
              return null;
            }

            const formattedDistance_meters =
              Math.floor(jobWithDistance.distance_meters) + " m";
            const formattedDistance_kilometers =
              jobWithDistance.distance_kilometers.toFixed(1) + " km";

            const distance =
              jobWithDistance.distance_meters < 1000
                ? formattedDistance_meters
                : formattedDistance_kilometers;

            return {
              ...job,
              distance,
              distance_meters: formattedDistance_meters,
              distance_kilometers: formattedDistance_kilometers,
              isBookmarked: bookmarkedJobIds.includes(job.id),
              startDate: job.startDate?.toISOString() || null,
              endDate: job.endDate?.toISOString() || null,
              createdAt: job.createdAt?.toISOString() || null,
              updatedAt: job.updatedAt?.toISOString() || null,
              appliedAt: job.appliedAt?.toISOString() || null,
            };
          }
        );

        return jobsWithFormattedDetails;
      } catch (error) {
        console.error(error);
        throw new Error("An error occurred while fetching nearby jobs.");
      }
    },

    AllJobsByDistance: async (_, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      const { skip, take } = args;

      try {
        const userResult = await context.prisma.user.findUnique({
          where: { id: userId },
          include: {
            addresses: {
              where: { isCurrent: true },
            },
            candidateAddress: true,
            candidatePreference: true,
          },
        });

        console.log(userResult);
        let userLatitude = userResult.addresses[0].latitude;
        let userLongitude = userResult.addresses[0].longitude;

        console.log(userLatitude);
        console.log(userLongitude);
        let LocationPreference = null;
        let isSearchByCity = false;
        let city = null;

        // 2e42c035-a10f-463f-8ca5-a335ed1e504b       My Current Location
        // 7d49edb5-ea56-42f4-a21a-c182c851afdf       Near My Address
        // ecd2af27-3783-42ff-93b5-81568d205ae6       Work In a Particular City

        if (userResult.length === 0) {
          throw new Error("User not found.");
        }

        if (userResult.candidatePreference.isCurrentLocationDefault) {
          console.log("Current Location");
          LocationPreference = "2e42c035-a10f-463f-8ca5-a335ed1e504b";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              console.log("true");
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;

              console.log(userResult.candidateAddress[i].latitude);
            }
          }
        } else if (userResult.candidatePreference.isNearMyAddressDefault) {
          console.log("Near My Address");
          LocationPreference = "7d49edb5-ea56-42f4-a21a-c182c851afdf";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;
            }
          }
        } else if (userResult.candidatePreference.isWorkInCityDefault) {
          console.log("Work In a Particular City");
          LocationPreference = "ecd2af27-3783-42ff-93b5-81568d205ae6";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              isSearchByCity = true;
              city = userResult.candidateAddress[i].city;
            }
          }
        } else {
          console.log("User Preference is not set for user: ", userId);
        }

        console.log("---------------------------------------");
        console.log(userLatitude);
        console.log(userLongitude);

        const query = `
        SELECT "Job".id, "Job".title, "Job".description, "Address".latitude, "Address".longitude,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) AS distance_meters,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) / 1000 AS distance_kilometers
        FROM "Job"
        INNER JOIN "Address" ON "Job".id = "Address"."jobId"
        WHERE ST_DWithin(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography,
          5000000000
        )
        AND "Job"."statusId" != '5ac89c4d-7587-4e2d-8227-6df4e943fb18' -- Exclude specific status ID
        ORDER BY ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        )
        LIMIT ${take} OFFSET ${skip}`;

        const result = await context.prisma.$queryRawUnsafe(query);

        // Extract the job IDs, distance in meters, and distance in kilometers from the result
        const jobsWithDistances = result.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          latitude: row.latitude,
          longitude: row.longitude,
          distance_meters: row.distance_meters,
          distance_kilometers: row.distance_kilometers,
        }));

        // Fetch full job details using findMany
        const jobs = await context.prisma.job.findMany({
          where: {
            id: {
              in: jobsWithDistances.map((job) => job.id), // Filter jobs by the retrieved IDs
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            organization: true,
            status: true,
            address: true,
            category: true,
            bookmarks: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            jobType: true,
            skills: true,
          },
        });

        const jobIds = jobsWithDistances.map((job) => job.id);

        const bookmarkedJobs = await context.prisma.bookmark.findMany({
          where: {
            userId,
            jobId: {
              in: jobIds,
            },
          },
          select: {
            jobId: true,
          },
        });

        const bookmarkedJobIds = bookmarkedJobs.map(
          (bookmark) => bookmark.jobId
        );

        const jobsWithFormattedDetails = jobsWithDistances.map(
          (jobWithDistance) => {
            const job = jobs.find((j) => j.id === jobWithDistance.id);
            if (!job) {
              return null;
            }

            const formattedDistance_meters =
              Math.floor(jobWithDistance.distance_meters) + " m";
            const formattedDistance_kilometers =
              jobWithDistance.distance_kilometers.toFixed(1) + " km";

            const distance =
              jobWithDistance.distance_meters < 1000
                ? formattedDistance_meters
                : formattedDistance_kilometers;

            return {
              ...job,
              distance,
              distance_meters: formattedDistance_meters,
              distance_kilometers: formattedDistance_kilometers,
              isBookmarked: bookmarkedJobIds.includes(job.id),
              startDate: job.startDate?.toISOString() || null,
              endDate: job.endDate?.toISOString() || null,
              createdAt: job.createdAt?.toISOString() || null,
              updatedAt: job.updatedAt?.toISOString() || null,
              appliedAt: job.appliedAt?.toISOString() || null,
            };
          }
        );

        return jobsWithFormattedDetails;
      } catch (error) {
        console.error(error);
        throw new Error("An error occurred while fetching nearby jobs.");
      }
    },

    DistantJobs: async (_, args, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";
      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      const { skip, take } = args;

      try {
        const userResult = await context.prisma.user.findUnique({
          where: { id: userId },
          include: {
            addresses: {
              where: { isCurrent: true },
            },
            candidateAddress: true,
            candidatePreference: true,
          },
        });

        let userLatitude = userResult.addresses[0].latitude;
        let userLongitude = userResult.addresses[0].longitude;

        console.log(userLatitude);
        console.log(userLongitude);
        let LocationPreference = null;
        let isSearchByCity = false;
        let city = null;

        // 2e42c035-a10f-463f-8ca5-a335ed1e504b       My Current Location
        // 7d49edb5-ea56-42f4-a21a-c182c851afdf       Near My Address
        // ecd2af27-3783-42ff-93b5-81568d205ae6       Work In a Particular City

        if (userResult.length === 0) {
          throw new Error("User not found.");
        }

        if (userResult.candidatePreference.isCurrentLocationDefault) {
          console.log("Current Location");
          LocationPreference = "2e42c035-a10f-463f-8ca5-a335ed1e504b";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;
            }
          }
        } else if (userResult.candidatePreference.isNearMyAddressDefault) {
          console.log("Near My Address");
          LocationPreference = "7d49edb5-ea56-42f4-a21a-c182c851afdf";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              userLatitude = userResult.candidateAddress[i].latitude;
              userLongitude = userResult.candidateAddress[i].longitude;
            }
          }
        } else if (userResult.candidatePreference.isWorkInCityDefault) {
          console.log("Work In a Particular City");
          LocationPreference = "ecd2af27-3783-42ff-93b5-81568d205ae6";

          for (let i = 0; i < userResult.candidateAddress.length; ++i) {
            if (
              userResult.candidateAddress[i].candidateAddressTypeId ===
              LocationPreference
            ) {
              isSearchByCity = true;
              city = userResult.candidateAddress[i].city;
            }
          }
        } else {
          console.log("User Preference is not set for user: ", userId);
        }

        console.log("---------------------------------------");
        console.log(userLatitude);
        console.log(userLongitude);

        const query = `
        SELECT "Job".id, "Job".title, "Job".description, "Address".latitude, "Address".longitude,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) AS distance_meters,
        ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        ) / 1000 AS distance_kilometers
        FROM "Job"
        INNER JOIN "Address" ON "Job".id = "Address"."jobId"
        WHERE NOT ST_DWithin(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography,
          50000
        )
        AND "Job"."statusId" != '5ac89c4d-7587-4e2d-8227-6df4e943fb18' -- Exclude specific status ID
        ORDER BY ST_Distance(
          ST_MakePoint("Address".longitude, "Address".latitude)::geography,
          ST_MakePoint(${userLongitude}::float, ${userLatitude}::float)::geography
        )
        LIMIT ${take} OFFSET ${skip}`;

        const result = await context.prisma.$queryRawUnsafe(query);

        // Extract the job IDs, distance in meters, and distance in kilometers from the result
        const jobsWithDistances = result.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          latitude: row.latitude,
          longitude: row.longitude,
          distance_meters: row.distance_meters,
          distance_kilometers: row.distance_kilometers,
        }));

        // Fetch full job details using findMany
        const jobs = await context.prisma.job.findMany({
          where: {
            id: {
              in: jobsWithDistances.map((job) => job.id), // Filter jobs by the retrieved IDs
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            organization: true,
            status: true,
            address: true,
            bookmarks: true,
            category: true,
            tags: true,
            jobDocuments: {
              include: {
                document: true,
              },
            },
            jobApplications: {
              include: {
                candidate: true,
                status: true,
              },
            },
            jobLevel: true,
            jobType: true,
            skills: true,
          },
        });

        const jobIds = jobsWithDistances.map((job) => job.id);

        const bookmarkedJobs = await context.prisma.bookmark.findMany({
          where: {
            userId,
            jobId: {
              in: jobIds,
            },
          },
          select: {
            jobId: true,
          },
        });

        const bookmarkedJobIds = bookmarkedJobs.map(
          (bookmark) => bookmark.jobId
        );

        const jobsWithFormattedDetails = jobsWithDistances.map(
          (jobWithDistance) => {
            const job = jobs.find((j) => j.id === jobWithDistance.id);
            if (!job) {
              return null;
            }

            const formattedDistance_meters =
              Math.floor(jobWithDistance.distance_meters) + " m";
            const formattedDistance_kilometers =
              jobWithDistance.distance_kilometers.toFixed(1) + " km";

            const distance =
              jobWithDistance.distance_meters < 1000
                ? formattedDistance_meters
                : formattedDistance_kilometers;

            return {
              ...job,
              distance,
              distance_meters: formattedDistance_meters,
              distance_kilometers: formattedDistance_kilometers,
              isBookmarked: bookmarkedJobIds.includes(job.id),
              startDate: job.startDate?.toISOString() || null,
              endDate: job.endDate?.toISOString() || null,
              createdAt: job.createdAt?.toISOString() || null,
              updatedAt: job.updatedAt?.toISOString() || null,
              appliedAt: job.appliedAt?.toISOString() || null,
            };
          }
        );

        return jobsWithFormattedDetails;
      } catch (error) {
        console.error(error);
        throw new Error("An error occurred while fetching nearby jobs.");
      }
    },

    DropdownSkillsAndTagsMerged: async (
      _,
      { searchKeyword, skip, take },
      context
    ) => {
      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      let mergedNames = [];

      // Fetch tag names
      const tagNames = await context.prisma.tag.findMany({
        where: {
          OR: [
            {
              name: {
                contains: searchKeyword || "",
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          name: true,
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          name: "asc",
        },
      });

      // Fetch skill names
      const skillNames = await context.prisma.skill.findMany({
        where: {
          OR: [
            {
              name: {
                contains: searchKeyword || "",
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          name: true,
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          name: "asc",
        },
      });

      // Concatenate and sort merged names
      mergedNames = mergedNames.concat(
        tagNames.map((tag) => tag.name),
        skillNames.map((skill) => skill.name)
      );

      // Remove duplicates by converting the array to a Set and back to an array
      const uniqueMergedNames = [...new Set(mergedNames)];

      // Sort the array alphabetically
      const sortedUniqueMergedNames = uniqueMergedNames.sort();

      // Get the exact number of unique names specified by take
      const slicedSortedUniqueMergedNames = sortedUniqueMergedNames.slice(
        0,
        sanitizedTake
      );

      return slicedSortedUniqueMergedNames;
    },

    _CandidateJobSearch: async (
      _,
      {
        searchString,
        skip,
        take,
        salaryAmountRange,
        searchKeywords,
        jobLevelId,
        jobTypeId,
      },
      context
    ) => {
      // Validate and sanitize skip and take values

      if (take <= 0) {
        return [];
      }
      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      try {
        // Check if at least one argument is provided
        if (
          !searchString &&
          (!searchKeywords || searchKeywords.length === 0) &&
          (!salaryAmountRange || salaryAmountRange.length === 0) &&
          !jobLevelId &&
          !jobTypeId
        ) {
          return [];
        }

        if (
          searchString === "" &&
          (!searchKeywords || searchKeywords.length === 0) &&
          (!salaryAmountRange || salaryAmountRange.length === 0) &&
          !jobLevelId &&
          !jobTypeId
        ) {
          return [];
        }

        // if (jobLevelId && !isUUID(jobLevelId)) {
        //   throw new Error("Invalid jobLevelId format.");
        // }

        // if (jobTypeId && !isUUID(jobTypeId)) {
        //   throw new Error("Invalid jobTypeId format.");
        // }

        const searchHistory =
          await context.prisma.CandidateJobSearchHistory.create({
            data: {
              searchString: searchString,
              searchKeywords: searchKeywords,

              salaryAmountRange: salaryAmountRange,

              jobLevelId: jobLevelId,
              jobTypeId: jobTypeId,
              skip: sanitizedSkip,
              take: sanitizedTake,
            },
          });
      } catch (error) {
        throw new Error(`Failed to record search history: ${error.message}`);
      }

      const searchFilters = {
        OR: [
          { title: { contains: searchString || "", mode: "insensitive" } },
          {
            description: { contains: searchString || "", mode: "insensitive" },
          },
        ],
        statusId: "d42ea4eb-b130-4a25-8d81-206e1fce5d48", // Filter by statusId
      };

      if (salaryAmountRange && salaryAmountRange.length === 2) {
        const [lowerAmount, upperAmount] = salaryAmountRange;
        if (lowerAmount <= upperAmount) {
          searchFilters.salaryAmount = {
            gte: lowerAmount,
            lte: upperAmount,
          };
        }
      }

      if (searchKeywords && searchKeywords.length > 0) {
        searchFilters.OR.push(
          { tags: { some: { name: { in: searchKeywords } } } },
          { skills: { some: { name: { in: searchKeywords } } } }
        );
      }

      if (jobLevelId && jobLevelId !== "7cfa0d3a-540a-462b-bbb2-8f5627675ad8") {
        searchFilters.jobLevelId = jobLevelId;
      }

      if (jobTypeId && jobTypeId !== "ed579c6a-f0e8-44ed-8a96-628db6d22251") {
        searchFilters.jobTypeId = jobTypeId;
      }

      const jobs = await context.prisma.job.findMany({
        where: searchFilters,
        include: {
          organization: true,
          status: true,
          address: true,
          category: true,
          jobType: true,
          bookmarks: true,
          tags: true,
          jobDocuments: {
            include: {
              document: true,
            },
          },
          jobApplications: {
            include: {
              candidate: true,
              status: true,
            },
          },
          jobLevel: true,
          skills: true,
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          updatedAt: "desc",
        },
      });

      return jobs;
    },

    CandidateJobSearch: async (
      _,
      {
        searchString,
        skip,
        take,
        salaryAmountRange,
        searchKeywords,
        jobLevelId,
        jobTypeId,
      },
      context
    ) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      const user = await context.prisma.user.findUnique({
        where: { id: userId },
        include: {
          addresses: {
            where: { isCurrent: true },
          },
        },
      });

      if (!user) {
        throw new Error("User not found.");
      }

      try {
        // Check if at least one argument is provided
        if (
          !searchString &&
          (!searchKeywords || searchKeywords.length === 0) &&
          (!salaryAmountRange || salaryAmountRange.length === 0) &&
          !jobLevelId &&
          !jobTypeId
        ) {
          return [];
        }

        if (
          searchString === "" &&
          (!searchKeywords || searchKeywords.length === 0) &&
          (!salaryAmountRange || salaryAmountRange.length === 0) &&
          !jobLevelId &&
          !jobTypeId
        ) {
          return [];
        }

        // if (jobLevelId && !isUUID(jobLevelId)) {
        //   throw new Error("Invalid jobLevelId format.");
        // }

        // if (jobTypeId && !isUUID(jobTypeId)) {
        //   throw new Error("Invalid jobTypeId format.");
        // }

        const searchHistory =
          await context.prisma.CandidateJobSearchHistory.create({
            data: {
              searchString: searchString,
              searchKeywords: searchKeywords,

              salaryAmountRange: salaryAmountRange,

              jobLevelId: jobLevelId,
              jobTypeId: jobTypeId,
              skip: sanitizedSkip,
              take: sanitizedTake,
            },
          });
      } catch (error) {
        throw new Error(`Failed to record search history: ${error.message}`);
      }

      const userLatitude = user.addresses[0].latitude;
      const userLongitude = user.addresses[0].longitude;

      const searchFilters = {
        OR: [
          { title: { contains: searchString || "", mode: "insensitive" } },
          {
            description: { contains: searchString || "", mode: "insensitive" },
          },
        ],
        statusId: "d42ea4eb-b130-4a25-8d81-206e1fce5d48", // Filter by statusId
      };

      if (salaryAmountRange && salaryAmountRange.length === 2) {
        const [lowerAmount, upperAmount] = salaryAmountRange;
        if (lowerAmount <= upperAmount) {
          searchFilters.salaryAmount = {
            gte: lowerAmount,
            lte: upperAmount,
          };
        }
      }

      if (searchKeywords && searchKeywords.length > 0) {
        searchFilters.OR.push(
          { tags: { some: { name: { in: searchKeywords } } } },
          { skills: { some: { name: { in: searchKeywords } } } }
        );
      }

      // if (jobLevelId && !isUUID(jobLevelId)) {
      //   throw new Error("Invalid jobLevelId format.");
      // }

      // if (jobTypeId && isUUID(jobTypeId)) {
      //   throw new Error("Invalid jobTypeId format.");
      // }

      if (jobLevelId && jobLevelId !== "7cfa0d3a-540a-462b-bbb2-8f5627675ad8") {
        searchFilters.jobLevelId = jobLevelId;
      }

      if (jobTypeId && jobTypeId !== "ed579c6a-f0e8-44ed-8a96-628db6d22251") {
        searchFilters.jobTypeId = jobTypeId;
      }

      const jobs = await context.prisma.job.findMany({
        where: searchFilters,
        include: {
          organization: true,
          status: true,
          address: true,
          category: true,
          jobType: true,
          bookmarks: true,
          tags: true,
          jobDocuments: {
            include: {
              document: true,
            },
          },
          jobApplications: {
            include: {
              candidate: true,
              status: true,
            },
          },
          jobLevel: true,
          skills: true,
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
      });

      const jobsWithDistance = jobs.map((job) => {
        const jobLatitude = job.address.latitude;
        const jobLongitude = job.address.longitude;
        const distance = haversineDistance(
          userLatitude,
          userLongitude,
          jobLatitude,
          jobLongitude
        );
        return {
          ...job,
          distance: formatDistance(distance),
          distanceValue: distance, // Add a new property to store the distance value
        };
      });

      // Sort jobs by distanceValue in ascending order
      jobsWithDistance.sort((a, b) => a.distanceValue - b.distanceValue);

      return jobsWithDistance;
    },

    DropdownTitleDescriptionMerged: async (
      _,
      { searchString, skip, take },
      context
    ) => {
      // Validate and sanitize skip and take values

      if (take <= 0) {
        return [];
      }
      const sanitizedSkip = Math.max(0, parseInt(skip) || 0);
      const sanitizedTake = Math.max(0, parseInt(take) || 10);

      try {
        // Check if at least one argument is provided
        if (!searchString) {
          // throw new Error("At least one search parameter must be provided.");
          return [];
        }

        if (searchString === "") {
          return [];
        }
      } catch (error) {
        throw new Error(`Failed to record search history: ${error.message}`);
      }

      const searchFilters = {
        OR: [
          { title: { contains: searchString || "", mode: "insensitive" } },
          {
            description: { contains: searchString || "", mode: "insensitive" },
          },
        ],
        statusId: "d42ea4eb-b130-4a25-8d81-206e1fce5d48", // Filter by statusId
      };

      const jobs = await context.prisma.job.findMany({
        where: searchFilters,
        select: {
          title: true, // Only select the title field
        },
        skip: sanitizedSkip,
        take: sanitizedTake,
        orderBy: {
          title: "asc", // Order titles alphabetically
        },
      });

      // Extract and arrange unique job titles
      const uniqueJobTitles = [...new Set(jobs.map((job) => job.title))];

      return uniqueJobTitles;
    },

    SearchHistory: async (_, { skip, take }, context) => {
      try {
        const totalRecords =
          await context.prisma.candidateJobSearchHistory.count();
        const recordsToDelete = Math.max(0, totalRecords - 3);
        if (recordsToDelete > 0) {
          const oldestRecords =
            await context.prisma.candidateJobSearchHistory.findMany({
              orderBy: { createdAt: "asc" },
              take: recordsToDelete,
            });
          const deletePromises = oldestRecords.map((record) =>
            context.prisma.candidateJobSearchHistory.delete({
              where: { id: record.id },
            })
          );
          await Promise.all(deletePromises);
        }

        // Retrieve the search history
        const searchHistory =
          await context.prisma.candidateJobSearchHistory.findMany({
            orderBy: { createdAt: "desc" },
            skip: skip,
            take: take,
          });

        return searchHistory;
      } catch (error) {
        throw new Error(`Failed to retrieve search history: ${error.message}`);
      }
    },

    _InitializeData: async (parent, args, context) => {
      const { password } = args;

      if (password !== "aamanto") {
        return "Password is incorrect!";
      }

      let forDel;

      const initilizeUniqueKey = await context.prisma.unique_key_count.create({
        data: {
          id: 1,
          jobCount: 1000021,
          prefix: "A",
        },
      });

      let createMany;

      // Create Role
      let userRole = await context.prisma.role.create({
        data: {
          id: "2d0043f5-c069-41d6-bc44-7f0c441aba12",
          name: "Candidate",
        },
      });

      userRole = await context.prisma.role.create({
        data: {
          id: "de9cdff9-f803-4e69-903e-932d6ea130e9",
          name: "Organization",
        },
      });

      // Create User
      let testUser = await context.prisma.user.create({
        data: {
          id: "d7bdcba2-aa31-4604-b7c6-594968475186",
          firstName: "Rehan",
          lastName: "Sarwar",
          profilePicture:
            "https://websites-static-assets.s3.us-east-2.amazonaws.com/Rehan's+Profile+Picture.jpg",
          roleId: "2d0043f5-c069-41d6-bc44-7f0c441aba12",
        },
      });

      // Create User
      testUser = await context.prisma.user.create({
        data: {
          id: "41897b86-770a-4c50-9acc-99090226a3d7",
          firstName: "Omer",
          lastName: "Nadeem",
          profilePicture:
            "https://websites-static-assets.s3.us-east-2.amazonaws.com/Rehan's+Profile+Picture.jpg",
          roleId: userRole.id,
        },
      });

      // Create Email
      let userEmail = await context.prisma.email.create({
        data: {
          id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
          email: "rehan.sarwar@aamanto.com",
          isPrimary: true,
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          description: "Personal Email",
          department: "IT",
        },
      });

      // Create Email
      userEmail = await context.prisma.email.create({
        data: {
          id: "0ac0355c-affd-4369-a795-430eabcdefb7",
          email: "omer.nadeem@aamanto.com",
          isPrimary: true,
          userId: "41897b86-770a-4c50-9acc-99090226a3d7",
          description: "Personal Email",
          department: "IT",
        },
      });

      // Create Phone
      let userPhone = await context.prisma.phone.create({
        data: {
          id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
          phone: "+923336535930",
          isPrimary: true,
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          description: "Personal Phone",
          department: "IT",
        },
      });

      // Create Phone
      userPhone = await context.prisma.phone.create({
        data: {
          id: "5fa36a9a-9671-46ad-bd5c-07e5c93f0cb5",
          phone: "+923324512722",
          isPrimary: true,
          userId: "41897b86-770a-4c50-9acc-99090226a3d7",
          description: "Personal Phone",
          department: "IT",
        },
      });

      let address = await context.prisma.Address.create({
        data: {
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          latitude: 43.6532,
          longitude: -79.3832,
          city: "Toronto",
          province: "Ontario",
          zipPostalCode: "M5V 2H1",
          country: "Canada",
          isCurrent: true,
        },
      });

      address = await context.prisma.Address.create({
        data: {
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          latitude: 43.7323,
          longitude: -79.3761,
          city: "Mississauga",
          province: "Ontario",
          zipPostalCode: "L5B 3C2",
          country: "Canada",
          isCurrent: false,
        },
      });

      //omer address

      address = await context.prisma.Address.create({
        data: {
          userId: "41897b86-770a-4c50-9acc-99090226a3d7",
          latitude: 43.6532,
          longitude: -79.3832,
          city: "Toronto",
          province: "Ontario",
          zipPostalCode: "M5V 2H1",
          country: "Canada",
          isCurrent: true,
        },
      });

      address = await context.prisma.Address.create({
        data: {
          userId: "41897b86-770a-4c50-9acc-99090226a3d7",
          latitude: 43.6532,
          longitude: -79.3832,
          city: "Toronto",
          province: "Ontario",
          zipPostalCode: "M5V 2H1",
          country: "Canada",
          isCurrent: false,
        },
      });

      let userPreference = await context.prisma.UserPreference.create({
        data: {
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          jobSearchRadiusKm: 50,
        },
      });

      // omer preference

      userPreference = await context.prisma.UserPreference.create({
        data: {
          userId: "41897b86-770a-4c50-9acc-99090226a3d7",
          jobSearchRadiusKm: 100,
        },
      });

      // Rehan Resume

      // Create Document Categories
      const categoryResume = await context.prisma.documentCategory.create({
        data: {
          name: "Resume",
        },
      });

      const categoryDrivingLicense =
        await context.prisma.documentCategory.create({
          data: {
            name: "Driving License",
          },
        });

      const categoryPassport = await context.prisma.documentCategory.create({
        data: {
          name: "Passport",
        },
      });

      const categoryOther = await context.prisma.documentCategory.create({
        data: {
          name: "Other",
        },
      });

      // Create Document for Resume 1
      const documentResume1 = await context.prisma.document.create({
        data: {
          title: "Rehan_Resume_1",
          fileName: "Rehan_Resume_1.pdf",
          fileSize: 408100,
          fileType: "application/pdf",
          fileURL:
            "https://crunos-internal-bucket.s3.ca-central-1.amazonaws.com/Resume+07-July-2023.pdf",
          categoryId: categoryResume.id,
        },
      });

      // Create Document for Resume 2
      const documentResume2 = await context.prisma.document.create({
        data: {
          title: "Rehan_Resume_2",
          fileName: "Rehan_Resume_2.pdf",
          fileSize: 408100,
          fileType: "application/pdf",
          fileURL:
            "https://crunos-internal-bucket.s3.ca-central-1.amazonaws.com/Resume+07-July-2023.pdf",
          categoryId: categoryResume.id,
        },
      });

      // Create UserDocument for Rehan (Resume 1)
      const userDocumentResume1 = await context.prisma.userDocument.create({
        data: {
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          documentId: documentResume1.id,
        },
      });

      // Create UserDocument for Rehan (Resume 2)
      const userDocumentResume2 = await context.prisma.userDocument.create({
        data: {
          userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
          documentId: documentResume2.id,
        },
      });

      // Create skills for user "Rehan"
      const skill1 = await context.prisma.skill.create({
        data: {
          name: "SQL",
          user: {
            connect: { id: "d7bdcba2-aa31-4604-b7c6-594968475186" },
          },
        },
      });

      const skill2 = await context.prisma.skill.create({
        data: {
          name: "Javascript",
          user: {
            connect: { id: "d7bdcba2-aa31-4604-b7c6-594968475186" },
          },
        },
      });

      const skill3 = await context.prisma.skill.create({
        data: {
          name: "GraphQL",
          user: {
            connect: { id: "d7bdcba2-aa31-4604-b7c6-594968475186" },
          },
        },
      });

      const dummyDesignations = [
        { name: "Frontend Developer" },
        { name: "Backend Developer" },
        { name: "UI/UX Designer" },
        // Add more dummy designations as needed
      ];

      for (const designationData of dummyDesignations) {
        await context.prisma.designation.create({
          data: designationData,
        });
      }

      const rehan = await context.prisma.user.findUnique({
        where: { id: "d7bdcba2-aa31-4604-b7c6-594968475186" },
      });

      const backendDeveloperDesignation =
        await context.prisma.designation.findFirst({
          where: { name: "Backend Developer" },
        });

      await context.prisma.user.update({
        where: { id: "d7bdcba2-aa31-4604-b7c6-594968475186" },
        data: {
          designation: {
            connect: { id: backendDeveloperDesignation.id },
          },
        },
      });

      //------------Job Dummy Data --------------------------------------------

      // Create Job Categories
      const dummyJobCategories = [
        { name: "Software Engineer" },
        { name: "Data Scientist" },
        { name: "Sales Executive" },
        { name: "UI/UX Designer" },
        { name: "Backend Developer" },
        { name: "Product Manager" },
        { name: "Full Stack Developer" },
        { name: "Machine Learning Engineer" },
        { name: "Marketing Specialist" },
        { name: "Network Administrator" },
      ];

      for (const categoryData of dummyJobCategories) {
        await context.prisma.jobCategory.create({
          data: categoryData,
        });
      }

      const dummyJobStatuses = [
        { name: "Open", description: "Job is open and accepting applications" },
        {
          name: "Closed",
          description: "Job is closed and no longer accepting applications",
        },
      ];

      for (const statusData of dummyJobStatuses) {
        await context.prisma.jobStatus.create({
          data: statusData,
        });
      }

      const dummyApplicationStatuses = [
        { name: "Applied", description: "Application has been applied" },
        { name: "Reviewing", description: "Application is being reviewed" },
        { name: "Accepted", description: "Application has been accepted" },
        { name: "Rejected", description: "Application has been rejected" },
      ];

      for (const statusData of dummyApplicationStatuses) {
        await context.prisma.applicationStatus.create({
          data: statusData,
        });
      }

      // Create Job Levels
      const dummyJobLevels = [
        { name: "Entry Level" },
        { name: "Mid Level" },
        { name: "Senior" },
        // Add more professional job levels as needed
      ];

      for (const levelData of dummyJobLevels) {
        await context.prisma.jobLevel.create({
          data: levelData,
        });
      }

      // Tags for jobs
      const uiUxTags = [
        { name: "UI/UX" },
        { name: "Design" },
        // Add more tags as needed
      ];

      const backendTags = [
        { name: "Backend" },
        { name: "Programming" },
        // Add more tags as needed
      ];

      const frontendTags = [
        { name: "Frontend" },
        { name: "HTML" },
        { name: "CSS" },
        { name: "JavaScript" },
        // Add more tags as needed
      ];

      const dbEngineerTags = [
        { name: "Database" },
        { name: "SQL" },
        // Add more tags as needed
      ];

      const devOpsTags = [
        { name: "DevOps" },
        { name: "CI/CD" },
        // Add more tags as needed
      ];

      // Skills for jobs
      const uiUxSkills = [
        { name: "Adobe XD" },
        { name: "Figma" },
        // Add more skills as needed
      ];

      const backendSkills = [
        { name: "Node.js" },
        { name: "Java" },
        // Add more skills as needed
      ];

      const frontendSkills = [
        { name: "React" },
        { name: "Angular" },
        // Add more skills as needed
      ];

      const dbEngineerSkills = [
        { name: "MySQL" },
        { name: "MongoDB" },
        // Add more skills as needed
      ];

      const devOpsSkills = [
        { name: "Docker" },
        { name: "Kubernetes" },
        // Add more skills as needed
      ];

      // Skills for jobs
      const softwareEngineerSkills = [
        { name: "Java" },
        { name: "Python" },
        // Add more skills as needed
      ];

      const dataScientistSkills = [
        { name: "Machine Learning" },
        { name: "Statistical Analysis" },
        // Add more skills as needed
      ];

      const salesExecutiveSkills = [
        { name: "Negotiation" },
        { name: "Sales Strategy" },
        // Add more skills as needed
      ];

      const productManagerSkills = [
        { name: "Product Development" },
        { name: "Market Research" },
        // Add more skills as needed
      ];

      const fullStackDeveloperSkills = [
        { name: "HTML" },
        { name: "CSS" },
        // Add more skills as needed
      ];

      const machineLearningEngineerSkills = [
        { name: "Deep Learning" },
        { name: "Computer Vision" },
        // Add more skills as needed
      ];

      const marketingSpecialistSkills = [
        { name: "Social Media Marketing" },
        { name: "Content Creation" },
        // Add more skills as needed
      ];

      const networkAdministratorSkills = [
        { name: "Network Configuration" },
        { name: "Firewall Management" },
        // Add more skills as needed
      ];

      const softwareEngineerTags = [
        { name: "Software Engineering" },
        { name: "Programming" },
        // Add more tags as needed
      ];

      const dataScientistTags = [
        { name: "Data Science" },
        { name: "Machine Learning" },
        // Add more tags as needed
      ];

      const salesExecutiveTags = [
        { name: "Sales" },
        { name: "B2B Sales" },
        // Add more tags as needed
      ];

      const productManagerTags = [
        { name: "Product Management" },
        { name: "Strategy" },
        // Add more tags as needed
      ];

      const fullStackDeveloperTags = [
        { name: "Full Stack Development" },
        { name: "Web Development" },
        // Add more tags as needed
      ];

      const machineLearningEngineerTags = [
        { name: "Machine Learning" },
        { name: "AI Algorithms" },
        // Add more tags as needed
      ];

      const marketingSpecialistTags = [
        { name: "Marketing" },
        { name: "Digital Marketing" },
        // Add more tags as needed
      ];

      const networkAdministratorTags = [
        { name: "Network Administration" },
        { name: "Network Security" },
        // Add more tags as needed
      ];

      const jobTitles = [
        "Software Engineer",
        "Data Scientist",
        "Sales Executive",
        "UI/UX Designer",
        "Backend Developer",
        "Product Manager",
        "Full Stack Developer",
        "Machine Learning Engineer",
        "Marketing Specialist",
        "Network Administrator",
      ];

      const jobDescriptions = [
        "We are seeking a skilled Software Engineer to join our development team.",
        "Looking for a Data Scientist to analyze and interpret complex data.",
        "Hiring Sales Executive with proven experience in B2B sales.",
        "Join our team as a UI/UX Designer and help create stunning user interfaces.",
        "Seeking a talented Backend Developer to build robust and scalable applications.",
        "We are hiring a Product Manager to lead product development and strategy.",
        "Join our team as a Full Stack Developer and work on exciting projects.",
        "Looking for a Machine Learning Engineer to develop cutting-edge ML models.",
        "Hiring a Marketing Specialist to drive marketing campaigns and initiatives.",
        "Seeking a Network Administrator to manage and maintain our network infrastructure.",
      ];

      const jobIcon = [
        "https://cdn-icons-png.flaticon.com/512/5906/5906160.png",
        "https://cdn-icons-png.flaticon.com/512/6361/6361001.png",
        "https://cdn-icons-png.flaticon.com/128/1200/1200167.png",
        "https://cdn-icons-png.flaticon.com/512/2721/2721304.png",
        "https://cdn-icons-png.flaticon.com/512/6213/6213731.png",
        "https://cdn-icons-png.flaticon.com/512/1191/1191942.png",
        "https://cdn-icons-png.flaticon.com/512/270/270798.png",
        "https://cdn-icons-png.flaticon.com/512/919/919825.png",
        "https://cdn-icons-png.flaticon.com/512/3933/3933072.png",
        "https://cdn-icons-png.flaticon.com/512/2151/2151741.png",
      ];

      // Create jobs with all dependencies
      for (let i = 0; i < 10; i++) {
        const jobId = "A100002" + (i + 1).toString().padStart(2, "0");

        let categoryId, tags, skills;

        switch (i) {
          case 0: // Software Engineer
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Software Engineer" },
              })
            ).id;
            tags = softwareEngineerTags;
            skills = softwareEngineerSkills;
            break;
          case 1: // Data Scientist
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Data Scientist" },
              })
            ).id;
            tags = dataScientistTags;
            skills = dataScientistSkills;
            break;
          case 2: // Sales Executive
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Sales Executive" },
              })
            ).id;
            tags = salesExecutiveTags;
            skills = salesExecutiveSkills;
            break;
          case 3: // UI/UX Designer
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "UI/UX Designer" },
              })
            ).id;
            tags = uiUxTags;
            skills = uiUxSkills;
            break;
          case 4: // Backend Developer
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Backend Developer" },
              })
            ).id;
            tags = backendTags;
            skills = backendSkills;
            break;
          case 5: // Product Manager
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Product Manager" },
              })
            ).id;
            tags = productManagerTags;
            skills = productManagerSkills;
            break;
          case 6: // Full Stack Developer
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Full Stack Developer" },
              })
            ).id;
            tags = fullStackDeveloperTags;
            skills = fullStackDeveloperSkills;
            break;
          case 7: // Machine Learning Engineer
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Machine Learning Engineer" },
              })
            ).id;
            tags = machineLearningEngineerTags;
            skills = machineLearningEngineerSkills;
            break;
          case 8: // Marketing Specialist
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Marketing Specialist" },
              })
            ).id;
            tags = marketingSpecialistTags;
            skills = marketingSpecialistSkills;
            break;
          case 9: // Network Administrator
            categoryId = (
              await context.prisma.jobCategory.findFirst({
                where: { name: "Network Administrator" },
              })
            ).id;
            tags = networkAdministratorTags;
            skills = networkAdministratorSkills;
            break;
          default:
            break;
        }

        const statusId = (
          await context.prisma.jobStatus.findFirst({ where: { name: "Open" } })
        ).id;
        const jobLevelId = (
          await context.prisma.jobLevel.findFirst({
            where: { name: "Mid Level" },
          })
        ).id;

        const rehanAddress = await context.prisma.Address.findFirst({
          where: {
            userId: "d7bdcba2-aa31-4604-b7c6-594968475186",
            isCurrent: true,
          },
        });

        await context.prisma.job.create({
          data: {
            id: jobId,
            organization: {
              connect: { id: "41897b86-770a-4c50-9acc-99090226a3d7" },
            },
            title: jobTitles[i],
            description: jobDescriptions[i],
            icon: jobIcon[i],
            isOpen: true,
            numberOfSeats: 3 + i,
            status: { connect: { id: statusId } },
            jobLevel: { connect: { id: jobLevelId } },
            category: { connect: { id: categoryId } },
            tags: { create: tags },
            skills: { create: skills },
            address: {
              create: {
                latitude: rehanAddress.latitude,
                longitude: rehanAddress.longitude,
                city: rehanAddress.city,
                province: rehanAddress.province,
                zipPostalCode: rehanAddress.zipPostalCode,
                country: rehanAddress.country,
                isCurrent: true,
              },
            },
          },
        });
      }

      console.log("Data initialization completed.");

      return "Data initialization completed.";
    },
  },

  Mutation: {

    DeleteAdditionalInformation: async (_, __, context) => {
      try {
        // Validate user token and obtain userId
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the user
        let user = await context.prisma.user.findUnique({
          where: { id: userId },
        });
    
        // Check if the user exists
        if (!user) {
          return {
            success: false,
            message: 'User not found!',
          };
        }
    
        // Delete or set additional information to null
        user = await context.prisma.user.update({
          where: { id: userId },
          data: {
            additionalInformation: null,
          },
        });
    
        return {
          success: true,
          message: 'Additional information deleted or set to null successfully.',
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to delete additional information: ${error.message}`,
        };
      }
    },
    

    UpdateAdditionalInformation: async (_, { additionalInformation }, context) => {
      try {
        // Validate user token and obtain userId
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the user
        let user = await context.prisma.user.findUnique({
          where: { id: userId },
        });
    
        // Check if the user exists
        if (!user) {
          return {
            success: false,
            message: 'User not found!',
            raw: null,
          };
        }
    
        // Update additional information
        user = await context.prisma.user.update({
          where: { id: userId },
          data: {
            additionalInformation,
          },
        });
    
        return {
          success: true,
          message: 'Additional information updated successfully.',
          raw: user,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to update additional information: ${error.message}`,
          raw: null,
        };
      }
    },
    

    DeleteCandidateSafetyInformation: async (_, { id }, context) => {
      try {
        // Validate user token and obtain userId
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the candidate safety information entry
        const candidateSafetyInfo = await context.prisma.candidateSafetyInformation.findUnique({
          where: { id },
        });
    
        // Check if the entry exists and belongs to the authenticated user
        if (!candidateSafetyInfo || candidateSafetyInfo.userId !== userId) {
          return {
            success: false,
            message: 'Candidate safety information not found or unauthorized to delete.',
          };
        }
    
        // Delete candidate safety information
        await context.prisma.candidateSafetyInformation.delete({
          where: { id },
        });
    
        return {
          success: true,
          message: 'Candidate safety information deleted successfully.',
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to delete candidate safety information: ${error.message}`,
        };
      }
    },
    
   
    AddCandidateSafetyInformation: async (_, { safetyInformationId }, context) => {
      try {
        // Validate user token and obtain userId
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the user
        let user = await context.prisma.user.findUnique({
          where: { id: userId },
          include: { workExperiences: true },
        });
    
        if (!user) {
          return {
            success: false,
            message: 'User not found!',
            candidateSafetyInformation: null,
          };
        }
    
        // Check if the safety information exists
        const safetyInfoExists = await context.prisma.safetyInformation.findUnique({
          where: { id: safetyInformationId },
        });
    
        if (!safetyInfoExists) {
          return {
            success: false,
            message: 'Safety information not found.',
            raw: null,
          };
        }
    
        // Add candidate safety information
        const newCandidateSafetyInformation = await context.prisma.candidateSafetyInformation.create({
          data: {
            userId,
            safetyInformationId,
          },
        });
    
        return {
          success: true,
          message: 'Candidate safety information added successfully.',
          raw: newCandidateSafetyInformation,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to add candidate safety information!`,
          raw: error.message,
        };
      }
    },

    
    
    
    
    
    

    FileUpload: async (_, { file }, context) => {
      //--------------------------- File Uploading Start ----------------------
      console.log("Before file upload");
      let is_valid_extension;

      let file_path_after_uploading = null;
      let filename_after_uploading = null;
      let fileSize = null;
      let fileType = null;
      let extension = null;
      let fileSizeInBytes = null;
      let fileURL = null;
      let fileSizeInKB = null;
      let fileSizeInMB = null;

      if (file) {
        const { createReadStream, filename, mimetype, encoding } = await file;
        fileType = mimetype;

        const stream = createReadStream();

        const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
        const writeStream = fs.createWriteStream(tempFilePath);
        stream.pipe(writeStream);

        const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
        //nadeem omer
        writeStream.on("finish", () => {
          const stats = fs.statSync(tempFilePath);
          fileSizeInBytes = stats.size;

          // Now you can use the fileSizeInBytes as needed
          // e.g., store it in a database or do further processing
          // ...

          // Check if the file size exceeds the maximum allowed size

          // Calculate file size in KB and MB
          if (fileSizeInBytes >= 1024 * 1024) {
            fileSizeInMB = fileSizeInBytes / (1024 * 1024);
            fileSizeInKB = fileSizeInBytes / 1024;
          } else if (fileSizeInBytes >= 1024) {
            fileSizeInKB = fileSizeInBytes / 1024;
          }

          if (fileSizeInMB) {
            fileSize = `${fileSizeInMB.toFixed(2)} MB`;
          } else if (fileSizeInKB) {
            fileSize = `${fileSizeInKB.toFixed(2)} KB`;
          } else {
            fileSize = `${fileSizeInBytes} Byte${
              fileSizeInBytes !== 1 ? "s" : ""
            }`;
          }

          console.log("File size in bytes:", fileSizeInBytes);
          console.log("Size in KB:", fileSizeInKB);
          console.log("Size in MB:", fileSizeInMB);
          console.log("Final calculated file size:", fileSize);

          if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
            // Cleanup the temporary file
            fs.unlinkSync(tempFilePath);

            return {
              success: false,
              message: "File size exceeds the maximum allowed size (1.5 MB).",
            };
          }
        });

        fileSize = setTimeout(function () {
          if (fileSize) {
            if (fileSizeInBytes >= 1000000) {
              return { success: false, message: "Very long size!" };
            }
          }
        }, 100);

        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);

        // console.log(stream);
        // stream.on("data", (chunk) => {
        //   fileSizeInBytes += chunk.length;
        // });
        // Convert the Readable stream to a Node.js stream
        const readableStream = new Readable();
        readableStream._read = () => {}; // Ensure the stream is in flowing mode

        // Pipe the GraphQL upload stream directly to the readableStream
        stream.on("data", (chunk) => {
          // fileSizeInBytes += chunk.length; // Increment file size
          readableStream.push(chunk);
        });
        stream.on("end", () => {
          readableStream.push(null); // Signal the end of the stream
        });

        // fileSizeInBytes = 2678793;
        // const localFilePath = path.join(__dirname, "uploads", filename);
        // console.log(localFilePath);
        // // Save the file locally
        // const localWriteStream = fs.createWriteStream(localFilePath);
        // await stream.pipe(localWriteStream);

        // // Read the file using fs
        // const fileStream = fs.createReadStream(localFilePath);

        // fs.createReadStream(localFilePath), console.log(fileStream);

        // const fileSizeInKB = bytesToKB(fileSizeInBytes);
        // const fileSizeInMB = bytesToMB(fileSizeInBytes);
        //nadeem

        console.log("=============================");

        console.log(fileSizeInBytes);

        console.log("=============================");

        console.log("Size in Byte: ", fileSizeInBytes);
        console.log("Size in KB: ", fileSizeInKB);
        console.log("Size in MB: ", fileSizeInMB);

        console.log("Final caluclated file size: ", fileSize);

        let arr = filename.split(".");

        let name = arr[0];
        let ext = arr.pop();
        extension = ext;
        if (ExtensionList.includes(ext.toLowerCase())) {
          is_valid_extension = true;
        } else {
          is_valid_extension = false;
        }

        if (!is_valid_extension) {
          return { success: false, message: "Invalid file extension!" };
          // throw new ValidationError("Invalid file extension!");
        }

        let url = path.join(`${name}-${Date.now()}.${ext}`);

        filename_after_uploading = url;
        AWS.config.update({
          accessKeyId: "AKIAUUWI6OUAROXDTLIW",
          secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
          //   region: "YOUR_REGION",
        });
        //akram
        const s3 = new AWS.S3();
        const bucketName = "crunos-internal-bucket/test";

        async function uploadFile() {
          const uploadParams = {
            Bucket: bucketName,
            Key: filename_after_uploading,
            Body: readableStream,
          };

          try {
            const data = await s3.upload(uploadParams).promise();
            // console.log("File uploaded successfully. ETag:", data.ETag);
            // console.log(data);
            return data;
          } catch (error) {
            console.error("Error uploading file:", error);
            throw error;
          }
        }

        async function upload_file() {
          return new Promise(async (resolve) => {
            //-------------------------------------
            await uploadFile()
              .then(async (data) => {
                console.log("File uploaded successfully:", data);
                file_path_after_uploading = data.Location;

                // console.log(file_path_after_uploading);
                // console.log(filename_after_uploading);

                // Assuming you have saved the uploaded file URL and filename
                fileURL = file_path_after_uploading; // Replace with your file URL
                console.log("file URL: ", file_path_after_uploading);
                const fileName = filename_after_uploading; // Replace with your filename

                resolve({ success: true, raw: "1" });
                // return { success: true, raw: "" };

                // return { success: true, raw: "" };
              })
              .catch((error) => {
                console.error("Error uploading file:", error);
                resolve({ success: false, raw: "1" });
                // return { success: false, raw: "" };
              });

            //-------------------------------------
          });
        }

        const returnVal = await upload_file();
        // return returnVal;
      } // end file uploading if

      console.log("After file upload");

      console.log("File Name: ", filename_after_uploading);
      console.log("File URL: ", file_path_after_uploading);

      // ===================================================================================

      // const uploadedFile = await context.prisma.file.create({
      //   data: {
      //     filename: filename_after_uploading, // Use the filename from the uploaded file
      //     url: file_path_after_uploading,
      //   },
      // });
      // console.log("After file upload");

      return {
        success: true,
        fileURL: file_path_after_uploading,
        filename: filename_after_uploading,
        // raw: uploadedFile,
      };
    },
    AddBusinessProfile: async (_, args, context) => {
      let {
        companyLogo,
        companyName,
        email,
        phone,
        officeAddress,
        streetLine1,
        streetLine2,
        country,
        province,
        city,
        zipPostalCode,
        location,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }



        let isEmailUnique =
        await context.prisma.email.findMany({
          where: {
            email: email,
          },
        });

      if (isEmailUnique.length > 0) {
        console.log("Email already exists! (Unique constraint failed)");

        return {
          success: false,
          raw: { message: "Email already exists! (Unique constraint failed)" },
        };
      } 







      let isPhoneUnique =
      await context.prisma.phone.findMany({
        where: {
          phone: phone,
        },
      });

    if (isPhoneUnique.length > 0) {
      console.log("Phone already exists! (Unique constraint failed)");

      return {
        success: false,
        raw: { message: "Phone already exists! (Unique constraint failed)" },
      };
    } 





        let file_path_after_uploading = null;
        let filename_after_uploading = null;
        let fileSize = null;
        let fileType = null;
        let extension = null;
        let fileSizeInBytes = null;
        let fileURL = null;
        let fileSizeInKB = null;
        let fileSizeInMB = null;
        let ExtensionList = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "tif",
          "webp",
          "bmp",
          "svg",

        ];

        let is_valid_extension;

        //============================= resume =============================================

        console.log("Before file upload");

        // Pipe the GraphQL upload stream directly to a temporary file

        if (companyLogo) {
          const { createReadStream, filename, mimetype, encoding } =
            await companyLogo;
          fileType = mimetype;

          const stream = createReadStream();

          const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
          const writeStream = fs.createWriteStream(tempFilePath);
          stream.pipe(writeStream);

          const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
          //nadeem omer
          writeStream.on("finish", () => {
            const stats = fs.statSync(tempFilePath);
            fileSizeInBytes = stats.size;

            // Now you can use the fileSizeInBytes as needed
            // e.g., store it in a database or do further processing
            // ...

            // Check if the file size exceeds the maximum allowed size

            // Calculate file size in KB and MB
            if (fileSizeInBytes >= 1024 * 1024) {
              fileSizeInMB = fileSizeInBytes / (1024 * 1024);
              fileSizeInKB = fileSizeInBytes / 1024;
            } else if (fileSizeInBytes >= 1024) {
              fileSizeInKB = fileSizeInBytes / 1024;
            }

            if (fileSizeInMB) {
              fileSize = `${fileSizeInMB.toFixed(2)} MB`;
            } else if (fileSizeInKB) {
              fileSize = `${fileSizeInKB.toFixed(2)} KB`;
            } else {
              fileSize = `${fileSizeInBytes} Byte${
                fileSizeInBytes !== 1 ? "s" : ""
              }`;
            }

            console.log("File size in bytes:", fileSizeInBytes);
            console.log("Size in KB:", fileSizeInKB);
            console.log("Size in MB:", fileSizeInMB);
            console.log("Final calculated file size:", fileSize);

            if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
              // Cleanup the temporary file
              fs.unlinkSync(tempFilePath);

              return {
                success: false,
                message: "File size exceeds the maximum allowed size (1.5 MB).",
              };
            }
          });

          fileSize = setTimeout(function () {
            if (fileSize) {
              if (fileSizeInBytes >= 1000000) {
                return { success: false, message: "Very long size!" };
              }
            }
          }, 100);

          // Convert the Readable stream to a Node.js stream
          const readableStream = new Readable();
          readableStream._read = () => {}; // Ensure the stream is in flowing mode

          // Pipe the GraphQL upload stream directly to the readableStream
          stream.on("data", (chunk) => {
            // fileSizeInBytes += chunk.length; // Increment file size
            readableStream.push(chunk);
          });
          stream.on("end", () => {
            readableStream.push(null); // Signal the end of the stream
          });


          console.log("=============================");

          console.log(fileSizeInBytes);

          console.log("=============================");

          console.log("Size in Byte: ", fileSizeInBytes);
          console.log("Size in KB: ", fileSizeInKB);
          console.log("Size in MB: ", fileSizeInMB);

          console.log("Final caluclated file size: ", fileSize);

          let arr = filename.split(".");

          let name = arr[0];
          let ext = arr.pop();
          extension = ext;
          if (ExtensionList.includes(ext.toLowerCase())) {
            is_valid_extension = true;
          } else {
            is_valid_extension = false;
          }

          if (!is_valid_extension) {
            return { success: false, message: "Invalid file extension!" };
            // throw new ValidationError("Invalid file extension!");
          }

          let url = path.join(`${name}-${Date.now()}.${ext}`);

          filename_after_uploading = url;
          AWS.config.update({
            accessKeyId: "AKIAUUWI6OUAROXDTLIW",
            secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
            //   region: "YOUR_REGION",
          });
          //akram
          const s3 = new AWS.S3();
          const bucketName = "crunos-internal-bucket/test";

          async function uploadFile() {
            const uploadParams = {
              Bucket: bucketName,
              Key: filename_after_uploading,
              Body: readableStream,
            };

            try {
              const data = await s3.upload(uploadParams).promise();
              // console.log("File uploaded successfully. ETag:", data.ETag);
              // console.log(data);
              return data;
            } catch (error) {
              console.error("Error uploading file:", error);
              throw error;
            }
          }

          async function upload_file() {
            return new Promise(async (resolve) => {
              //-------------------------------------
              uploadFile()
                .then(async (data) => {
                  console.log("File uploaded successfully:", data);
                  file_path_after_uploading = data.Location;

                  // console.log(file_path_after_uploading);
                  // console.log(filename_after_uploading);

                  // Assuming you have saved the uploaded file URL and filename
                  fileURL = file_path_after_uploading; // Replace with your file URL
                  console.log("file URL: ", file_path_after_uploading);
                  const fileName = filename_after_uploading; // Replace with your filename

               
                  resolve({ success: true, raw: "" });
                  return { success: true, raw: "" };

                  // return { success: true, raw: "" };
                })
                .catch((error) => {
                  console.error("Error uploading file:", error);
                  resolve({ success: false, raw: "" });
                  return { success: false, raw: "" };
                });

              //-------------------------------------
            });
          }

          const returnVal = await upload_file();
          // return returnVal;
        } // end file uploading if

        console.log("After file upload");
        //============================= resume =============================================

        companyLogo = file_path_after_uploading;
        console.log("Company Logo URL: ", companyLogo);

        if (companyLogo && companyName) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyName: companyName,
              companyLogo: companyLogo,
            },
          });
        } else if (companyLogo) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyLogo: companyLogo,
            },
          });
        } else if (companyName) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyName: companyName,
            },
          });
        } else {
          console.log("Company Logo and Company name not exists!");
        }

        let userEmail = null;

        let isEmailAlreadyExistsForThisUser =
          await context.prisma.email.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isEmailAlreadyExistsForThisUser.length) {
          console.log("Email not already exists so this one is primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: true,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        } else {
          console.log("Email already exists so this one is not primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: false,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        }

        let userPhone = null;

        let isPhoneAlreadyExistsForThisUser =
          await context.prisma.phone.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isPhoneAlreadyExistsForThisUser.length) {
          console.log("Phone not already exists so this one is primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: true,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        } else {
          console.log("Phone already exists so this one is not primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: false,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        }


        let addressObj = {};

        function addToAddressObject(key, value) {
          if (value !== null && value !== "") {
            addressObj[key] = value;
          }
        }

        addToAddressObject("officeAddress", officeAddress);
        addToAddressObject("streetLine1", streetLine1);
        addToAddressObject("streetLine2", streetLine2);
        addToAddressObject("country", country);
        addToAddressObject("province", province);
        addToAddressObject("city", city);
        addToAddressObject("zipPostalCode", zipPostalCode);
        addToAddressObject("location", location);

        console.log(addressObj);

        let userAddress = null;

        if (Object.keys(addressObj).length > 0) {
          console.log("addressObj is not empty and contains values.");

          //=============================

          let isAddressAlreadyExistsForThisUser =
            await context.prisma.address.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isAddressAlreadyExistsForThisUser.length) {
            console.log("Address not already exists so this one is primary!");

            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: true,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          } else {
            console.log("Address already exists so this one is not primary!");
            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: false,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          }

          //============================
        } else {
          console.log("addressObj is empty.");
        }

        let businessContactInfoObj = {};

        function addToBusinessContactInfoObjObject(key, value) {
          if (value !== null && value !== "") {
            businessContactInfoObj[key] = value;
          }
        }

        if (userEmail) {
          addToBusinessContactInfoObjObject("emailId", userEmail.id);
        }

        if (userPhone) {
          addToBusinessContactInfoObjObject("phoneId", userPhone.id);
        }

        if (userAddress) {
          addToBusinessContactInfoObjObject("addressId", userAddress.id);
        }

        console.log(businessContactInfoObj);

        let userBusinessContactInfo = null;

        if (Object.keys(businessContactInfoObj).length > 0) {
          businessContactInfoObj.userId = userId;
          console.log(
            "businessContactInfoObj is not empty and contains values."
          );

          //=============================

          let isuserBusinessContactInfoAlreadyExistsForThisUser =
            await context.prisma.BusinessContactInfo.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isuserBusinessContactInfoAlreadyExistsForThisUser.length) {
            console.log(
              "businessContactInfoObj not already exists so this one is primary!"
            );

            businessContactInfoObj.isCurrent = true;
            userBusinessContactInfo =
              await context.prisma.BusinessContactInfo.create({
                data: businessContactInfoObj,
              });
          } else {
            console.log(
              "businessContactInfoObj already exists so this one is not primary!"
            );
            businessContactInfoObj.isCurrent = false;
            userBusinessContactInfo =
              await context.prisma.BusinessContactInfo.create({
                data: businessContactInfoObj,
              });
          }

          //============================
        } else {
          console.log("businessContactInfoObj is empty.");
        }

        return { success: true, raw: userBusinessContactInfo };
      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },

    AddPersonalProfile: async (_, args, context) => {
      let {
        profilePicture,
        name,
        dateOfBirth,
        email,
        phone,
        officeAddress,
        streetLine1,
        streetLine2,
        country,
        province,
        city,
        zipPostalCode,
        location,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }



        let isEmailUnique =
        await context.prisma.email.findMany({
          where: {
            email: email,
          },
        });

      if (isEmailUnique.length > 0) {
        console.log("Email already exists! (Unique constraint failed)");

        return {
          success: false,
          raw: { message: "Email already exists! (Unique constraint failed)" },
        };
      } 







      let isPhoneUnique =
      await context.prisma.phone.findMany({
        where: {
          phone: phone,
        },
      });

    if (isPhoneUnique.length > 0) {
      console.log("Phone already exists! (Unique constraint failed)");

      return {
        success: false,
        raw: { message: "Phone already exists! (Unique constraint failed)" },
      };
    } 





        let file_path_after_uploading = null;
        let filename_after_uploading = null;
        let fileSize = null;
        let fileType = null;
        let extension = null;
        let fileSizeInBytes = null;
        let fileURL = null;
        let fileSizeInKB = null;
        let fileSizeInMB = null;
        let ExtensionList = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "tif",
          "webp",
          "bmp",
          "svg",

        ];

        let is_valid_extension;

        //============================= resume =============================================

        console.log("Before file upload");

        // Pipe the GraphQL upload stream directly to a temporary file

        if (profilePicture) {
          const { createReadStream, filename, mimetype, encoding } =
            await profilePicture;
          fileType = mimetype;

          const stream = createReadStream();

          const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
          const writeStream = fs.createWriteStream(tempFilePath);
          stream.pipe(writeStream);

          const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
          //nadeem omer
          writeStream.on("finish", () => {
            const stats = fs.statSync(tempFilePath);
            fileSizeInBytes = stats.size;

            // Now you can use the fileSizeInBytes as needed
            // e.g., store it in a database or do further processing
            // ...

            // Check if the file size exceeds the maximum allowed size

            // Calculate file size in KB and MB
            if (fileSizeInBytes >= 1024 * 1024) {
              fileSizeInMB = fileSizeInBytes / (1024 * 1024);
              fileSizeInKB = fileSizeInBytes / 1024;
            } else if (fileSizeInBytes >= 1024) {
              fileSizeInKB = fileSizeInBytes / 1024;
            }

            if (fileSizeInMB) {
              fileSize = `${fileSizeInMB.toFixed(2)} MB`;
            } else if (fileSizeInKB) {
              fileSize = `${fileSizeInKB.toFixed(2)} KB`;
            } else {
              fileSize = `${fileSizeInBytes} Byte${
                fileSizeInBytes !== 1 ? "s" : ""
              }`;
            }

            console.log("File size in bytes:", fileSizeInBytes);
            console.log("Size in KB:", fileSizeInKB);
            console.log("Size in MB:", fileSizeInMB);
            console.log("Final calculated file size:", fileSize);

            if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
              // Cleanup the temporary file
              fs.unlinkSync(tempFilePath);

              return {
                success: false,
                message: "File size exceeds the maximum allowed size (1.5 MB).",
              };
            }
          });

          fileSize = setTimeout(function () {
            if (fileSize) {
              if (fileSizeInBytes >= 1000000) {
                return { success: false, message: "Very long size!" };
              }
            }
          }, 100);

          // Convert the Readable stream to a Node.js stream
          const readableStream = new Readable();
          readableStream._read = () => {}; // Ensure the stream is in flowing mode

          // Pipe the GraphQL upload stream directly to the readableStream
          stream.on("data", (chunk) => {
            // fileSizeInBytes += chunk.length; // Increment file size
            readableStream.push(chunk);
          });
          stream.on("end", () => {
            readableStream.push(null); // Signal the end of the stream
          });


          console.log("=============================");

          console.log(fileSizeInBytes);

          console.log("=============================");

          console.log("Size in Byte: ", fileSizeInBytes);
          console.log("Size in KB: ", fileSizeInKB);
          console.log("Size in MB: ", fileSizeInMB);

          console.log("Final caluclated file size: ", fileSize);

          let arr = filename.split(".");

          let name = arr[0];
          let ext = arr.pop();
          extension = ext;
          if (ExtensionList.includes(ext.toLowerCase())) {
            is_valid_extension = true;
          } else {
            is_valid_extension = false;
          }

          if (!is_valid_extension) {
            return { success: false, message: "Invalid file extension!" };
            // throw new ValidationError("Invalid file extension!");
          }

          let url = path.join(`${name}-${Date.now()}.${ext}`);

          filename_after_uploading = url;
          AWS.config.update({
            accessKeyId: "AKIAUUWI6OUAROXDTLIW",
            secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
            //   region: "YOUR_REGION",
          });
          //akram
          const s3 = new AWS.S3();
          const bucketName = "crunos-internal-bucket/test";

          async function uploadFile() {
            const uploadParams = {
              Bucket: bucketName,
              Key: filename_after_uploading,
              Body: readableStream,
            };

            try {
              const data = await s3.upload(uploadParams).promise();
              // console.log("File uploaded successfully. ETag:", data.ETag);
              // console.log(data);
              return data;
            } catch (error) {
              console.error("Error uploading file:", error);
              throw error;
            }
          }

          async function upload_file() {
            return new Promise(async (resolve) => {
              //-------------------------------------
              uploadFile()
                .then(async (data) => {
                  console.log("File uploaded successfully:", data);
                  file_path_after_uploading = data.Location;

                  // console.log(file_path_after_uploading);
                  // console.log(filename_after_uploading);

                  // Assuming you have saved the uploaded file URL and filename
                  fileURL = file_path_after_uploading; // Replace with your file URL
                  console.log("file URL: ", file_path_after_uploading);
                  const fileName = filename_after_uploading; // Replace with your filename

               
                  resolve({ success: true, raw: "" });
                  return { success: true, raw: "" };

                  // return { success: true, raw: "" };
                })
                .catch((error) => {
                  console.error("Error uploading file:", error);
                  resolve({ success: false, raw: "" });
                  return { success: false, raw: "" };
                });

              //-------------------------------------
            });
          }

          const returnVal = await upload_file();
          // return returnVal;
        } // end file uploading if

        console.log("After file upload");
        //============================= resume =============================================

        profilePicture = file_path_after_uploading;
        console.log("Company Logo URL: ", profilePicture);

        // name,
        // dateOfBirth,

        if (profilePicture && name) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              firstName: name,
              profilePicture: profilePicture,
            },
          });
        } else if (profilePicture) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              profilePicture: profilePicture,
            },
          });
        } else if (name) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              firstName: name,
            },
          });
        } else {
          console.log("Company Logo and Company name not exists!");
        }


        if(dateOfBirth){
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              dateOfBirth: dateOfBirth,
            },
          });
        }else{
          console.log("Date of birth not exists!");
        }

        let userEmail = null;

        let isEmailAlreadyExistsForThisUser =
          await context.prisma.email.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isEmailAlreadyExistsForThisUser.length) {
          console.log("Email not already exists so this one is primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: true,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        } else {
          console.log("Email already exists so this one is not primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: false,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        }

        let userPhone = null;

        let isPhoneAlreadyExistsForThisUser =
          await context.prisma.phone.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isPhoneAlreadyExistsForThisUser.length) {
          console.log("Phone not already exists so this one is primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: true,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        } else {
          console.log("Phone already exists so this one is not primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: false,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        }


        let addressObj = {};

        function addToAddressObject(key, value) {
          if (value !== null && value !== "") {
            addressObj[key] = value;
          }
        }

        addToAddressObject("officeAddress", officeAddress);
        addToAddressObject("streetLine1", streetLine1);
        addToAddressObject("streetLine2", streetLine2);
        addToAddressObject("country", country);
        addToAddressObject("province", province);
        addToAddressObject("city", city);
        addToAddressObject("zipPostalCode", zipPostalCode);
        addToAddressObject("location", location);

        console.log(addressObj);

        let userAddress = null;

        if (Object.keys(addressObj).length > 0) {
          console.log("addressObj is not empty and contains values.");

          //=============================

          let isAddressAlreadyExistsForThisUser =
            await context.prisma.address.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isAddressAlreadyExistsForThisUser.length) {
            console.log("Address not already exists so this one is primary!");

            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: true,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          } else {
            console.log("Address already exists so this one is not primary!");
            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: false,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          }

          //============================
        } else {
          console.log("addressObj is empty.");
        }

        let businessContactInfoObj = {};

        function addToBusinessContactInfoObjObject(key, value) {
          if (value !== null && value !== "") {
            businessContactInfoObj[key] = value;
          }
        }

        if (userEmail) {
          addToBusinessContactInfoObjObject("emailId", userEmail.id);
        }

        if (userPhone) {
          addToBusinessContactInfoObjObject("phoneId", userPhone.id);
        }

        if (userAddress) {
          addToBusinessContactInfoObjObject("addressId", userAddress.id);
        }

        console.log(businessContactInfoObj);

        let userBusinessContactInfo = null;

        if (Object.keys(businessContactInfoObj).length > 0) {
          businessContactInfoObj.userId = userId;
          console.log(
            "businessContactInfoObj is not empty and contains values."
          );

          //=============================

          let isuserBusinessContactInfoAlreadyExistsForThisUser =
            await context.prisma.PersonalContactInfo.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isuserBusinessContactInfoAlreadyExistsForThisUser.length) {
            console.log(
              "businessContactInfoObj not already exists so this one is primary!"
            );

            businessContactInfoObj.isCurrent = true;
            userBusinessContactInfo =
              await context.prisma.PersonalContactInfo.create({
                data: businessContactInfoObj,
              });
          } else {
            console.log(
              "businessContactInfoObj already exists so this one is not primary!"
            );
            businessContactInfoObj.isCurrent = false;
            userBusinessContactInfo =
              await context.prisma.PersonalContactInfo.create({
                data: businessContactInfoObj,
              });
          }

          //============================
        } else {
          console.log("businessContactInfoObj is empty.");
        }

        return { success: true, raw: userBusinessContactInfo };
      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },

    UpdateBusinessProfile: async (_, args, context) => {
      let {
        id,
        companyLogo,
        companyName,
        email,
        phone,
        officeAddress,
        streetLine1,
        streetLine2,
        country,
        province,
        city,
        zipPostalCode,
        location,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }



        let existingBusinessContactInfo = await context.prisma.BusinessContactInfo.findUnique({
          where: { id },
        });
    
        if (!existingBusinessContactInfo) {
          return { success: false, raw: { message: 'BusinessContactInfo not found!' } };
        }



        if(existingBusinessContactInfo.emailId){
           // Delete the record
           await context.prisma.email.delete({
            where: { id: existingBusinessContactInfo.emailId},
          });
        }

    


        let isEmailUnique =
        await context.prisma.email.findMany({
          where: {
            email: email,
          },
        });

      if (isEmailUnique.length > 0) {
        console.log("Email already exists! (Unique constraint failed)");

        return {
          success: false,
          raw: { message: "Email already exists! (Unique constraint failed)" },
        };
      } 





      if(existingBusinessContactInfo.phoneId){
        // Delete the record
        await context.prisma.phone.delete({
         where: { id: existingBusinessContactInfo.phoneId},
       });
     }



      let isPhoneUnique =
      await context.prisma.phone.findMany({
        where: {
          phone: phone,
        },
      });

    if (isPhoneUnique.length > 0) {
      console.log("Phone already exists! (Unique constraint failed)");

      return {
        success: false,
        raw: { message: "Phone already exists! (Unique constraint failed)" },
      };
    } 





        let file_path_after_uploading = null;
        let filename_after_uploading = null;
        let fileSize = null;
        let fileType = null;
        let extension = null;
        let fileSizeInBytes = null;
        let fileURL = null;
        let fileSizeInKB = null;
        let fileSizeInMB = null;
        let ExtensionList = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "tif",
          "webp",
          "bmp",
          "svg",

        ];

        let is_valid_extension;

        //============================= resume =============================================

        console.log("Before file upload");

        // Pipe the GraphQL upload stream directly to a temporary file

        if (companyLogo) {
          const { createReadStream, filename, mimetype, encoding } =
            await companyLogo;
          fileType = mimetype;

          const stream = createReadStream();

          const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
          const writeStream = fs.createWriteStream(tempFilePath);
          stream.pipe(writeStream);

          const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
          //nadeem omer
          writeStream.on("finish", () => {
            const stats = fs.statSync(tempFilePath);
            fileSizeInBytes = stats.size;

            // Now you can use the fileSizeInBytes as needed
            // e.g., store it in a database or do further processing
            // ...

            // Check if the file size exceeds the maximum allowed size

            // Calculate file size in KB and MB
            if (fileSizeInBytes >= 1024 * 1024) {
              fileSizeInMB = fileSizeInBytes / (1024 * 1024);
              fileSizeInKB = fileSizeInBytes / 1024;
            } else if (fileSizeInBytes >= 1024) {
              fileSizeInKB = fileSizeInBytes / 1024;
            }

            if (fileSizeInMB) {
              fileSize = `${fileSizeInMB.toFixed(2)} MB`;
            } else if (fileSizeInKB) {
              fileSize = `${fileSizeInKB.toFixed(2)} KB`;
            } else {
              fileSize = `${fileSizeInBytes} Byte${
                fileSizeInBytes !== 1 ? "s" : ""
              }`;
            }

            console.log("File size in bytes:", fileSizeInBytes);
            console.log("Size in KB:", fileSizeInKB);
            console.log("Size in MB:", fileSizeInMB);
            console.log("Final calculated file size:", fileSize);

            if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
              // Cleanup the temporary file
              fs.unlinkSync(tempFilePath);

              return {
                success: false,
                message: "File size exceeds the maximum allowed size (1.5 MB).",
              };
            }
          });

          fileSize = setTimeout(function () {
            if (fileSize) {
              if (fileSizeInBytes >= 1000000) {
                return { success: false, message: "Very long size!" };
              }
            }
          }, 100);

          // Convert the Readable stream to a Node.js stream
          const readableStream = new Readable();
          readableStream._read = () => {}; // Ensure the stream is in flowing mode

          // Pipe the GraphQL upload stream directly to the readableStream
          stream.on("data", (chunk) => {
            // fileSizeInBytes += chunk.length; // Increment file size
            readableStream.push(chunk);
          });
          stream.on("end", () => {
            readableStream.push(null); // Signal the end of the stream
          });


          console.log("=============================");

          console.log(fileSizeInBytes);

          console.log("=============================");

          console.log("Size in Byte: ", fileSizeInBytes);
          console.log("Size in KB: ", fileSizeInKB);
          console.log("Size in MB: ", fileSizeInMB);

          console.log("Final caluclated file size: ", fileSize);

          let arr = filename.split(".");

          let name = arr[0];
          let ext = arr.pop();
          extension = ext;
          if (ExtensionList.includes(ext.toLowerCase())) {
            is_valid_extension = true;
          } else {
            is_valid_extension = false;
          }

          if (!is_valid_extension) {
            return { success: false, message: "Invalid file extension!" };
            // throw new ValidationError("Invalid file extension!");
          }

          let url = path.join(`${name}-${Date.now()}.${ext}`);

          filename_after_uploading = url;
          AWS.config.update({
            accessKeyId: "AKIAUUWI6OUAROXDTLIW",
            secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
            //   region: "YOUR_REGION",
          });
          //akram
          const s3 = new AWS.S3();
          const bucketName = "crunos-internal-bucket/test";

          async function uploadFile() {
            const uploadParams = {
              Bucket: bucketName,
              Key: filename_after_uploading,
              Body: readableStream,
            };

            try {
              const data = await s3.upload(uploadParams).promise();
              // console.log("File uploaded successfully. ETag:", data.ETag);
              // console.log(data);
              return data;
            } catch (error) {
              console.error("Error uploading file:", error);
              throw error;
            }
          }

          async function upload_file() {
            return new Promise(async (resolve) => {
              //-------------------------------------
              uploadFile()
                .then(async (data) => {
                  console.log("File uploaded successfully:", data);
                  file_path_after_uploading = data.Location;

                  // console.log(file_path_after_uploading);
                  // console.log(filename_after_uploading);

                  // Assuming you have saved the uploaded file URL and filename
                  fileURL = file_path_after_uploading; // Replace with your file URL
                  console.log("file URL: ", file_path_after_uploading);
                  const fileName = filename_after_uploading; // Replace with your filename

               
                  resolve({ success: true, raw: "" });
                  return { success: true, raw: "" };

                  // return { success: true, raw: "" };
                })
                .catch((error) => {
                  console.error("Error uploading file:", error);
                  resolve({ success: false, raw: "" });
                  return { success: false, raw: "" };
                });

              //-------------------------------------
            });
          }

          const returnVal = await upload_file();
          // return returnVal;
        } // end file uploading if

        console.log("After file upload");
        //============================= resume =============================================

        companyLogo = file_path_after_uploading;
        console.log("Company Logo URL: ", companyLogo);

        if (companyLogo && companyName) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyName: companyName,
              companyLogo: companyLogo,
            },
          });
        } else if (companyLogo) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyLogo: companyLogo,
            },
          });
        } else if (companyName) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              companyName: companyName,
            },
          });
        } else {
          console.log("Company Logo and Company name not exists!");
        }

        let userEmail = null;

        let isEmailAlreadyExistsForThisUser =
          await context.prisma.email.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isEmailAlreadyExistsForThisUser.length) {
          console.log("Email not already exists so this one is primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: true,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        } else {
          console.log("Email already exists so this one is not primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: false,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        }

        let userPhone = null;

        let isPhoneAlreadyExistsForThisUser =
          await context.prisma.phone.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isPhoneAlreadyExistsForThisUser.length) {
          console.log("Phone not already exists so this one is primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: true,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        } else {
          console.log("Phone already exists so this one is not primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: false,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        }




        if(existingBusinessContactInfo.addressId){
          // Delete the record
          await context.prisma.address.delete({
           where: { id: existingBusinessContactInfo.addressId},
         });
       }




        let addressObj = {};

        function addToAddressObject(key, value) {
          if (value !== null && value !== "") {
            addressObj[key] = value;
          }
        }

        addToAddressObject("officeAddress", officeAddress);
        addToAddressObject("streetLine1", streetLine1);
        addToAddressObject("streetLine2", streetLine2);
        addToAddressObject("country", country);
        addToAddressObject("province", province);
        addToAddressObject("city", city);
        addToAddressObject("zipPostalCode", zipPostalCode);
        addToAddressObject("location", location);

        console.log(addressObj);

        let userAddress = null;

        if (Object.keys(addressObj).length > 0) {
          console.log("addressObj is not empty and contains values.");

          //=============================

          let isAddressAlreadyExistsForThisUser =
            await context.prisma.address.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isAddressAlreadyExistsForThisUser.length) {
            console.log("Address not already exists so this one is primary!");

            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: true,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          } else {
            console.log("Address already exists so this one is not primary!");
            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: false,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          }

          //============================
        } else {
          console.log("addressObj is empty.");
        }

        let businessContactInfoObj = {};

        function addToBusinessContactInfoObjObject(key, value) {
          if (value !== null && value !== "") {
            businessContactInfoObj[key] = value;
          }
        }

        if (userEmail) {
          addToBusinessContactInfoObjObject("emailId", userEmail.id);
        }

        if (userPhone) {
          addToBusinessContactInfoObjObject("phoneId", userPhone.id);
        }

        if (userAddress) {
          addToBusinessContactInfoObjObject("addressId", userAddress.id);
        }

        console.log(businessContactInfoObj);

        let userBusinessContactInfo = null;

        if (Object.keys(businessContactInfoObj).length > 0) {
          businessContactInfoObj.userId = userId;
          console.log(
            "businessContactInfoObj is not empty and contains values."
          );

          //=============================

          let isuserBusinessContactInfoAlreadyExistsForThisUser =
            await context.prisma.BusinessContactInfo.findMany({
              where: {
                userId: userId,
              },
            });

          if (isuserBusinessContactInfoAlreadyExistsForThisUser.length < 2) {
            console.log(
              "businessContactInfoObj not already exists so this one is primary!"
            );

            businessContactInfoObj.isCurrent = true;
            userBusinessContactInfo = await context.prisma.BusinessContactInfo.update({
              where: { id: existingBusinessContactInfo.id },
              data: businessContactInfoObj,
            });



            // existingBusinessContactInfo = await context.prisma.BusinessContactInfo.findMany({
            //   where: { userId: userId },
            // });


        
            if (!existingBusinessContactInfo) {
              return { success: false, raw: { message: 'BusinessContactInfo not found!' } };
            }


          } else {
            console.log(
              "businessContactInfoObj already exists so this one is not primary!"
            );
            // businessContactInfoObj.isCurrent = false;
            // userBusinessContactInfo =
            //   await context.prisma.BusinessContactInfo.create({
            //     data: businessContactInfoObj,
            //   });

              userBusinessContactInfo = await context.prisma.BusinessContactInfo.update({
                where: { id: existingBusinessContactInfo.id },
                data: businessContactInfoObj,
              });
          }

          //============================
        } else {
          console.log("businessContactInfoObj is empty.");
        }

        return { success: true, raw: userBusinessContactInfo };
      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },


    UpdatePersonalProfile: async (_, args, context) => {
      let {
        id,
        profilePicture,
        name,
        dateOfBirth,
        email,
        phone,
        officeAddress,
        streetLine1,
        streetLine2,
        country,
        province,
        city,
        zipPostalCode,
        location,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }

        // BusinessContactInfo

        let existingBusinessContactInfo = await context.prisma.PersonalContactInfo.findUnique({
          where: { id },
        });
    
        if (!existingBusinessContactInfo) {
          return { success: false, raw: { message: 'PersonalContactInfo not found!' } };
        }



        if(existingBusinessContactInfo.emailId){
           // Delete the record
           await context.prisma.email.delete({
            where: { id: existingBusinessContactInfo.emailId},
          });
        }

    


        let isEmailUnique =
        await context.prisma.email.findMany({
          where: {
            email: email,
          },
        });

      if (isEmailUnique.length > 0) {
        console.log("Email already exists! (Unique constraint failed)");

        return {
          success: false,
          raw: { message: "Email already exists! (Unique constraint failed)" },
        };
      } 





      if(existingBusinessContactInfo.phoneId){
        // Delete the record
        await context.prisma.phone.delete({
         where: { id: existingBusinessContactInfo.phoneId},
       });
     }



      let isPhoneUnique =
      await context.prisma.phone.findMany({
        where: {
          phone: phone,
        },
      });

    if (isPhoneUnique.length > 0) {
      console.log("Phone already exists! (Unique constraint failed)");

      return {
        success: false,
        raw: { message: "Phone already exists! (Unique constraint failed)" },
      };
    } 





        let file_path_after_uploading = null;
        let filename_after_uploading = null;
        let fileSize = null;
        let fileType = null;
        let extension = null;
        let fileSizeInBytes = null;
        let fileURL = null;
        let fileSizeInKB = null;
        let fileSizeInMB = null;
        let ExtensionList = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "tif",
          "webp",
          "bmp",
          "svg",

        ];

        let is_valid_extension;

        //============================= resume =============================================

        console.log("Before file upload");

        // Pipe the GraphQL upload stream directly to a temporary file

        if (profilePicture) {
          const { createReadStream, filename, mimetype, encoding } =
            await profilePicture;
          fileType = mimetype;

          const stream = createReadStream();

          const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
          const writeStream = fs.createWriteStream(tempFilePath);
          stream.pipe(writeStream);

          const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
          //nadeem omer
          writeStream.on("finish", () => {
            const stats = fs.statSync(tempFilePath);
            fileSizeInBytes = stats.size;

            // Now you can use the fileSizeInBytes as needed
            // e.g., store it in a database or do further processing
            // ...

            // Check if the file size exceeds the maximum allowed size

            // Calculate file size in KB and MB
            if (fileSizeInBytes >= 1024 * 1024) {
              fileSizeInMB = fileSizeInBytes / (1024 * 1024);
              fileSizeInKB = fileSizeInBytes / 1024;
            } else if (fileSizeInBytes >= 1024) {
              fileSizeInKB = fileSizeInBytes / 1024;
            }

            if (fileSizeInMB) {
              fileSize = `${fileSizeInMB.toFixed(2)} MB`;
            } else if (fileSizeInKB) {
              fileSize = `${fileSizeInKB.toFixed(2)} KB`;
            } else {
              fileSize = `${fileSizeInBytes} Byte${
                fileSizeInBytes !== 1 ? "s" : ""
              }`;
            }

            console.log("File size in bytes:", fileSizeInBytes);
            console.log("Size in KB:", fileSizeInKB);
            console.log("Size in MB:", fileSizeInMB);
            console.log("Final calculated file size:", fileSize);

            if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
              // Cleanup the temporary file
              fs.unlinkSync(tempFilePath);

              return {
                success: false,
                message: "File size exceeds the maximum allowed size (1.5 MB).",
              };
            }
          });

          fileSize = setTimeout(function () {
            if (fileSize) {
              if (fileSizeInBytes >= 1000000) {
                return { success: false, message: "Very long size!" };
              }
            }
          }, 100);

          // Convert the Readable stream to a Node.js stream
          const readableStream = new Readable();
          readableStream._read = () => {}; // Ensure the stream is in flowing mode

          // Pipe the GraphQL upload stream directly to the readableStream
          stream.on("data", (chunk) => {
            // fileSizeInBytes += chunk.length; // Increment file size
            readableStream.push(chunk);
          });
          stream.on("end", () => {
            readableStream.push(null); // Signal the end of the stream
          });


          console.log("=============================");

          console.log(fileSizeInBytes);

          console.log("=============================");

          console.log("Size in Byte: ", fileSizeInBytes);
          console.log("Size in KB: ", fileSizeInKB);
          console.log("Size in MB: ", fileSizeInMB);

          console.log("Final caluclated file size: ", fileSize);

          let arr = filename.split(".");

          let name = arr[0];
          let ext = arr.pop();
          extension = ext;
          if (ExtensionList.includes(ext.toLowerCase())) {
            is_valid_extension = true;
          } else {
            is_valid_extension = false;
          }

          if (!is_valid_extension) {
            return { success: false, message: "Invalid file extension!" };
            // throw new ValidationError("Invalid file extension!");
          }

          let url = path.join(`${name}-${Date.now()}.${ext}`);

          filename_after_uploading = url;
          AWS.config.update({
            accessKeyId: "AKIAUUWI6OUAROXDTLIW",
            secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
            //   region: "YOUR_REGION",
          });
          //akram
          const s3 = new AWS.S3();
          const bucketName = "crunos-internal-bucket/test";

          async function uploadFile() {
            const uploadParams = {
              Bucket: bucketName,
              Key: filename_after_uploading,
              Body: readableStream,
            };

            try {
              const data = await s3.upload(uploadParams).promise();
              // console.log("File uploaded successfully. ETag:", data.ETag);
              // console.log(data);
              return data;
            } catch (error) {
              console.error("Error uploading file:", error);
              throw error;
            }
          }

          async function upload_file() {
            return new Promise(async (resolve) => {
              //-------------------------------------
              uploadFile()
                .then(async (data) => {
                  console.log("File uploaded successfully:", data);
                  file_path_after_uploading = data.Location;

                  // console.log(file_path_after_uploading);
                  // console.log(filename_after_uploading);

                  // Assuming you have saved the uploaded file URL and filename
                  fileURL = file_path_after_uploading; // Replace with your file URL
                  console.log("file URL: ", file_path_after_uploading);
                  const fileName = filename_after_uploading; // Replace with your filename

               
                  resolve({ success: true, raw: "" });
                  return { success: true, raw: "" };

                  // return { success: true, raw: "" };
                })
                .catch((error) => {
                  console.error("Error uploading file:", error);
                  resolve({ success: false, raw: "" });
                  return { success: false, raw: "" };
                });

              //-------------------------------------
            });
          }

          const returnVal = await upload_file();
          // return returnVal;
        } // end file uploading if

        console.log("After file upload");
        //============================= resume =============================================

        profilePicture = file_path_after_uploading;
        console.log("Company Logo URL: ", profilePicture);

        if (profilePicture && name) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              firstName: name,
              profilePicture: profilePicture,
            },
          });
        } else if (profilePicture) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              profilePicture: profilePicture,
            },
          });
        } else if (name) {
          // Update the existing record
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              firstName: name,
            },
          });
        } else {
          console.log("Company Logo and Company name not exists!");
        }


        if(dateOfBirth){
          await context.prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              dateOfBirth: dateOfBirth,
            },
          });
        }else{
          console.log("Date of birth not exists!");
        }
        

        let userEmail = null;

        let isEmailAlreadyExistsForThisUser =
          await context.prisma.email.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isEmailAlreadyExistsForThisUser.length) {
          console.log("Email not already exists so this one is primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: true,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        } else {
          console.log("Email already exists so this one is not primary!");
          userEmail = await context.prisma.email.create({
            data: {
              // id: "fdb067fb-1022-40ed-8eee-765da6fb4d38",
              email: email,
              isPrimary: false,
              userId: userId,
              // description: "Personal Email",
              // department: "IT",
            },
          });
        }

        let userPhone = null;

        let isPhoneAlreadyExistsForThisUser =
          await context.prisma.phone.findMany({
            where: {
              userId: userId,
            },
          });

        if (!isPhoneAlreadyExistsForThisUser.length) {
          console.log("Phone not already exists so this one is primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: true,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        } else {
          console.log("Phone already exists so this one is not primary!");
          userPhone = await context.prisma.phone.create({
            data: {
              // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
              phone: phone,
              isPrimary: false,
              userId: userId,
              // description: "Personal Phone",
              // department: "IT",
            },
          });
        }




        if(existingBusinessContactInfo.addressId){
          // Delete the record
          await context.prisma.address.delete({
           where: { id: existingBusinessContactInfo.addressId},
         });
       }




        let addressObj = {};

        function addToAddressObject(key, value) {
          if (value !== null && value !== "") {
            addressObj[key] = value;
          }
        }

        addToAddressObject("officeAddress", officeAddress);
        addToAddressObject("streetLine1", streetLine1);
        addToAddressObject("streetLine2", streetLine2);
        addToAddressObject("country", country);
        addToAddressObject("province", province);
        addToAddressObject("city", city);
        addToAddressObject("zipPostalCode", zipPostalCode);
        addToAddressObject("location", location);

        console.log(addressObj);

        let userAddress = null;

        if (Object.keys(addressObj).length > 0) {
          console.log("addressObj is not empty and contains values.");

          //=============================

          let isAddressAlreadyExistsForThisUser =
            await context.prisma.address.findMany({
              where: {
                userId: userId,
              },
            });

          if (!isAddressAlreadyExistsForThisUser.length) {
            console.log("Address not already exists so this one is primary!");

            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: true,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          } else {
            console.log("Address already exists so this one is not primary!");
            userAddress = await context.prisma.address.create({
              data: {
                // id: "8cadb22b-28a7-4049-8b7f-07bc14e303e9",
                officeAddress,
                streetLine1,
                streetLine2,
                country,
                province,
                city,
                zipPostalCode,
                location,
                userId,
                isCurrent: false,
                // description: "Personal Phone",
                // department: "IT",
              },
            });
          }

          //============================
        } else {
          console.log("addressObj is empty.");
        }

        let businessContactInfoObj = {};

        function addToBusinessContactInfoObjObject(key, value) {
          if (value !== null && value !== "") {
            businessContactInfoObj[key] = value;
          }
        }

        if (userEmail) {
          addToBusinessContactInfoObjObject("emailId", userEmail.id);
        }

        if (userPhone) {
          addToBusinessContactInfoObjObject("phoneId", userPhone.id);
        }

        if (userAddress) {
          addToBusinessContactInfoObjObject("addressId", userAddress.id);
        }

        console.log(businessContactInfoObj);

        let userBusinessContactInfo = null;

        if (Object.keys(businessContactInfoObj).length > 0) {
          businessContactInfoObj.userId = userId;
          console.log(
            "businessContactInfoObj is not empty and contains values."
          );

          //=============================

          let isuserBusinessContactInfoAlreadyExistsForThisUser =
            await context.prisma.PersonalContactInfo.findMany({
              where: {
                userId: userId,
              },
            });

          if (isuserBusinessContactInfoAlreadyExistsForThisUser.length < 2) {
            console.log(
              "businessContactInfoObj not already exists so this one is primary!"
            );

            businessContactInfoObj.isCurrent = true;
            userBusinessContactInfo = await context.prisma.PersonalContactInfo.update({
              where: { id: existingBusinessContactInfo.id },
              data: businessContactInfoObj,
            });



            // existingBusinessContactInfo = await context.prisma.BusinessContactInfo.findMany({
            //   where: { userId: userId },
            // });


        
            if (!existingBusinessContactInfo) {
              return { success: false, raw: { message: 'PersonalContactInfo not found!' } };
            }


          } else {
            console.log(
              "businessContactInfoObj already exists so this one is not primary!"
            );
            // businessContactInfoObj.isCurrent = false;
            // userBusinessContactInfo =
            //   await context.prisma.BusinessContactInfo.create({
            //     data: businessContactInfoObj,
            //   });

              userBusinessContactInfo = await context.prisma.PersonalContactInfo.update({
                where: { id: existingBusinessContactInfo.id },
                data: businessContactInfoObj,
              });
          }

          //============================
        } else {
          console.log("businessContactInfoObj is empty.");
        }

        return { success: true, raw: userBusinessContactInfo };
      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },


    DeleteBusinessProfile: async (_, args, context) => {
      let {
        id,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }





        // Check if the BusinessContactInfo record exists and belongs to the user
    const existingBusinessContactInfo = await context.prisma.BusinessContactInfo.findUnique({
      where: { id },
      include: {
        email: true,
        phone: true,
        address: true, // Include the associated Address record
      },
    });

    if (!existingBusinessContactInfo) {
      return { success: false, raw: { message: "BusinessContactInfo not found" } };
    }

    if (existingBusinessContactInfo.userId !== userId) {
      return { success: false, raw: { message: "BusinessContactInfo does not belong to the user" } };
    }




  // Delete associated Email record
  if (existingBusinessContactInfo.email) {
    await context.prisma.email.delete({
      where: { id: existingBusinessContactInfo.email.id },
    });
  }


      // Delete associated Phone record
      if (existingBusinessContactInfo.phone) {
        await context.prisma.phone.delete({
          where: { id: existingBusinessContactInfo.phone.id },
        });
      }


          // Delete associated Address record
    if (existingBusinessContactInfo.address) {
      await context.prisma.address.delete({
        where: { id: existingBusinessContactInfo.address.id },
      });
    }


    // Use Prisma to delete the BusinessContactInfo
    await context.prisma.BusinessContactInfo.delete({
      where: { id },
    });






        // Check the remaining BusinessContactInfo records for the user
        const remainingBusinessContactInfo = await context.prisma.BusinessContactInfo.findMany({
          where: { userId: userId },
        });



    if (remainingBusinessContactInfo.length === 1) {
      // If only one record is left, set it as isCurrent: true
      await context.prisma.BusinessContactInfo.update({
        where: { id: remainingBusinessContactInfo[0].id },
        data: { isCurrent: true },
      });
    } else if (remainingBusinessContactInfo.length > 1) {
      // Sort the remaining records by createdAt in descending order

      if(existingBusinessContactInfo.isCurrent === true){

        remainingBusinessContactInfo.sort((a, b) => b.createdAt - a.createdAt);

        // Update the latest one as isCurrent: true
        await context.prisma.BusinessContactInfo.update({
          where: { id: remainingBusinessContactInfo[0].id },
          data: { isCurrent: true },
        });
      }



    }




    return { success: true, raw: { message: "BusinessContactInfo and associated records deleted successfully" } };
       

      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },


    DeletePersonalProfile: async (_, args, context) => {
      let {
        id,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }





        // Check if the BusinessContactInfo record exists and belongs to the user
    const existingBusinessContactInfo = await context.prisma.PersonalContactInfo.findUnique({
      where: { id },
      include: {
        email: true,
        phone: true,
        address: true, // Include the associated Address record
      },
    });

    if (!existingBusinessContactInfo) {
      return { success: false, raw: { message: "PersonalContactInfo not found" } };
    }

    if (existingBusinessContactInfo.userId !== userId) {
      return { success: false, raw: { message: "PersonalContactInfo does not belong to the user" } };
    }




  // Delete associated Email record
  if (existingBusinessContactInfo.email) {
    await context.prisma.email.delete({
      where: { id: existingBusinessContactInfo.email.id },
    });
  }


      // Delete associated Phone record
      if (existingBusinessContactInfo.phone) {
        await context.prisma.phone.delete({
          where: { id: existingBusinessContactInfo.phone.id },
        });
      }


          // Delete associated Address record
    if (existingBusinessContactInfo.address) {
      await context.prisma.address.delete({
        where: { id: existingBusinessContactInfo.address.id },
      });
    }


    // Use Prisma to delete the BusinessContactInfo
    await context.prisma.PersonalContactInfo.delete({
      where: { id },
    });






        // Check the remaining BusinessContactInfo records for the user
        const remainingBusinessContactInfo = await context.prisma.PersonalContactInfo.findMany({
          where: { userId: userId },
        });



    if (remainingBusinessContactInfo.length === 1) {
      // If only one record is left, set it as isCurrent: true
      await context.prisma.PersonalContactInfo.update({
        where: { id: remainingBusinessContactInfo[0].id },
        data: { isCurrent: true },
      });
    } else if (remainingBusinessContactInfo.length > 1) {
      // Sort the remaining records by createdAt in descending order

      if(existingBusinessContactInfo.isCurrent === true){

        remainingBusinessContactInfo.sort((a, b) => b.createdAt - a.createdAt);

        // Update the latest one as isCurrent: true
        await context.prisma.PersonalContactInfo.update({
          where: { id: remainingBusinessContactInfo[0].id },
          data: { isCurrent: true },
        });
      }



    }




    return { success: true, raw: { message: "PersonalContactInfo and associated records deleted successfully" } };
       

      } catch (error) {
        console.log(error);
        return { success: false, raw: { message: error.message } };
      }
    },

    SetPrimaryBusinessProfile: async (_, args, context) => {

      let id = args.id;
      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }



        const userBusinessContactInfos = await context.prisma.BusinessContactInfo.findMany({
          where: { userId: userId },
        });
        
        const selectedBusinessContactInfo = userBusinessContactInfos.find(info => info.id === id);



        if (!selectedBusinessContactInfo) {
          return { success: false, raw: { message: "BusinessContactInfo not found or does not belong to the user" } };
        }





            // Set all BusinessContactInfo records of the user as isCurrent: false
    await context.prisma.BusinessContactInfo.updateMany({
      where: { userId: userId },
      data: { isCurrent: false },
    });



    await context.prisma.BusinessContactInfo.update({
      where: { id },
      data: { isCurrent: true },
    });

    return { success: true, raw: { message: "BusinessContactInfo updated successfully" }};

      } catch (error) {
        console.error(error);
        return { success: false, raw: { message: error.message } };
      }

    },

    SetPrimaryPersonalProfile: async (_, args, context) => {

      let id = args.id;
      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        if (existingUser.roleId !== "de9cdff9-f803-4e69-903e-932d6ea130e9") {
          console.log("User is not a company user!", existingUser.roleId);
          
          return {
            success: false,
            raw: { message: "User is not a company user!" },
          };
        }



        const userBusinessContactInfos = await context.prisma.PersonalContactInfo.findMany({
          where: { userId: userId },
        });
        
        const selectedBusinessContactInfo = userBusinessContactInfos.find(info => info.id === id);



        if (!selectedBusinessContactInfo) {
          return { success: false, raw: { message: "PersonalContactInfo not found or does not belong to the user" } };
        }





            // Set all BusinessContactInfo records of the user as isCurrent: false
    await context.prisma.PersonalContactInfo.updateMany({
      where: { userId: userId },
      data: { isCurrent: false },
    });



    await context.prisma.PersonalContactInfo.update({
      where: { id },
      data: { isCurrent: true },
    });

    return { success: true, raw: { message: "PersonalContactInfo updated successfully" }};

      } catch (error) {
        console.error(error);
        return { success: false, raw: { message: error.message } };
      }

    },
    

    DeleteCandidateDocument: async (_, { id }, context) => {
      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        const deletedCandidateDocument =
          await context.prisma.candidateDocument.deleteMany({
            where: {
              id,
              userId,
            },
          });


          if(deletedCandidateDocument.count < 1){
            return {
              success: true,
              message: "File not found!",
              raw: deletedCandidateDocument,
            };
          }else{
            return {
              success: true,
              message: "CandidateDocument deleted successfully",
              raw: deletedCandidateDocument,
            };
          }
       
      } catch (error) {
        console.error("Error deleting CandidateDocument:", error);
        return {
          success: false,
          message: "Failed to delete CandidateDocument",
          raw: null,
        };
      }
    },
    UploadCandidateDocument: async (
      _,
      { candidateFileType, file },
      context
    ) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");


      const documentTypesWithFile = [
        "690a2283-80c0-459c-9f61-1bd7af3283eb", // Resume
        "96f0bf7d-280d-49ac-bf33-a9eb82f8f9a4", // Other
      ];

      if (documentTypesWithFile.includes(candidateFileType)) {
        console.log(
          "------------------------condition true 1--------------------------"
        );
        // Check if a file was provided
        if (!file) {
          return {
            success: false,
            message: "A file is required for this document type.",
          };
          // throw new Error("A file is required for this document type.");
        }
      } else{
        console.log(
          "------------------------condition true 2--------------------------"
        );
        return {
          success: false,
          message: "An invalid document type.",
        };
      }



      // Check if candidateFileType is valid
      let validDocumentTypes =
        await context.prisma.candidateDocumentType.findMany({
          where: {
            id: candidateFileType,
          },
        });

      if (!validDocumentTypes.length) {
        return {
          success: false,
          message: "Invalid candidateFileType.",
        };
        // throw new Error('Invalid candidateFileType.');
      }

      // Check if candidateFileType is valid and corresponds to a document that doesn't require a file
      const documentTypesWithoutFile = [
        "3c6c430b-a468-44dc-b05f-981b0f1e8003", // Employee Agreement
        "a2b87362-0cb9-4373-9867-4632892d16f4", // Employee Privacy Policy
        "ea7ea9eb-5ab3-490e-b08a-0aaa7c464b36", // Employee Terms & Conditions
      ];



      // else if (documentTypesWithoutFile.includes(candidateFileType)) {
      //   console.log(
      //     "------------------------condition true 2 --------------------------"
      //   );
      //   // validDocumentTypes =
      //   //   await context.prisma.candidateDocumentType.findMany({
      //   //     where: {
      //   //       id: candidateFileType,
      //   //     },
      //   //   });

      //   // if (!validDocumentTypes[0].length) {
      //   //   return {
      //   //     success: false,
      //   //     message: "Invalid candidateFileType.",
      //   //   };
      //   //   // throw new Error('Invalid candidateFileType.');
      //   // }

      //   const existingCandidateDocument =
      //     await context.prisma.candidateDocument.findFirst({
      //       where: {
      //         userId,
      //         candidateDocumentTypeId: candidateFileType,
      //       },
      //     });

      //   if (existingCandidateDocument) {
      //     // If the record exists, update acceptedTermsConditions
      //     console.log(
      //       "------------------------condition true 3 --------------------------"
      //     );
      //     const updatedCandidateDocument =
      //       await context.prisma.candidateDocument.update({
      //         where: {
      //           id: existingCandidateDocument.id,
      //         },
      //         data: {
      //           acceptedTermsConditions: accepted,
      //         },
      //       });
      //     console.log(
      //       "Updated existing candidate document:",
      //       updatedCandidateDocument
      //     );

      //     return { success: true, raw: updatedCandidateDocument };
      //   } else {
      //     // If the record doesn't exist, create a new one

      //     console.log(
      //       "------------------------condition true 4--------------------------"
      //     );

      //     console.log("Condition True!");

      //     // console.log(candidateFileType);
      //     // console.log(accepted);
      //     const newCandidateDocument =
      //       await context.prisma.candidateDocument.create({
      //         data: {
      //           candidateDocumentTypeId: candidateFileType,
      //           acceptedTermsConditions: accepted,
      //           userId,
      //         },
      //       });
      //     console.log("Created new candidate document:", newCandidateDocument);
      //     return { success: true, raw: newCandidateDocument };
      //   }
      // }

      // Your file upload logic here using the provided S3 upload function

      const bytesToKB = (bytes) => {
        return bytes / 1024; // 1 KB = 1024 bytes
      };

      const bytesToMB = (bytes) => {
        return bytes / (1024 * 1024); // 1 MB = 1024 KB
      };

      let file_path_after_uploading = null;
      let filename_after_uploading = null;
      let fileSize = null;
      let fileType = null;
      let extension = null;
      let fileSizeInBytes = null;
      let fileURL = null;
      let fileSizeInKB = null;
      let fileSizeInMB = null;
      let ExtensionList = [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "tif",
        "webp",
        "bmp",
        "svg",
        "pdf",
        "doc",
        "docx",
        "csv",
        "xlsx",
        "xlsm",
        "xlsb",
        "xltx",
      ];

      let is_valid_extension;

      //============================= resume =============================================

      console.log("Before file upload");

      // Pipe the GraphQL upload stream directly to a temporary file

      if (file) {
        const { createReadStream, filename, mimetype, encoding } = await file;
        fileType = mimetype;

        const stream = createReadStream();

        const tempFilePath = "./tempfile"; // Adjust the path and filename as needed
        const writeStream = fs.createWriteStream(tempFilePath);
        stream.pipe(writeStream);

        const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB in bytes
        //nadeem omer
        writeStream.on("finish", () => {
          const stats = fs.statSync(tempFilePath);
          fileSizeInBytes = stats.size;

          // Now you can use the fileSizeInBytes as needed
          // e.g., store it in a database or do further processing
          // ...

          // Check if the file size exceeds the maximum allowed size

          // Calculate file size in KB and MB
          if (fileSizeInBytes >= 1024 * 1024) {
            fileSizeInMB = fileSizeInBytes / (1024 * 1024);
            fileSizeInKB = fileSizeInBytes / 1024;
          } else if (fileSizeInBytes >= 1024) {
            fileSizeInKB = fileSizeInBytes / 1024;
          }

          if (fileSizeInMB) {
            fileSize = `${fileSizeInMB.toFixed(2)} MB`;
          } else if (fileSizeInKB) {
            fileSize = `${fileSizeInKB.toFixed(2)} KB`;
          } else {
            fileSize = `${fileSizeInBytes} Byte${
              fileSizeInBytes !== 1 ? "s" : ""
            }`;
          }

          console.log("File size in bytes:", fileSizeInBytes);
          console.log("Size in KB:", fileSizeInKB);
          console.log("Size in MB:", fileSizeInMB);
          console.log("Final calculated file size:", fileSize);

          if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
            // Cleanup the temporary file
            fs.unlinkSync(tempFilePath);

            return {
              success: false,
              message: "File size exceeds the maximum allowed size (1.5 MB).",
            };
          }
        });

        fileSize = setTimeout(function () {
          if (fileSize) {
            if (fileSizeInBytes >= 1000000) {
              return { success: false, message: "Very long size!" };
            }
          }
        }, 100);

        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);
        // console.log(fileSizeInBytes);

        // console.log(stream);
        // stream.on("data", (chunk) => {
        //   fileSizeInBytes += chunk.length;
        // });
        // Convert the Readable stream to a Node.js stream
        const readableStream = new Readable();
        readableStream._read = () => {}; // Ensure the stream is in flowing mode

        // Pipe the GraphQL upload stream directly to the readableStream
        stream.on("data", (chunk) => {
          // fileSizeInBytes += chunk.length; // Increment file size
          readableStream.push(chunk);
        });
        stream.on("end", () => {
          readableStream.push(null); // Signal the end of the stream
        });

        // fileSizeInBytes = 2678793;
        // const localFilePath = path.join(__dirname, "uploads", filename);
        // console.log(localFilePath);
        // // Save the file locally
        // const localWriteStream = fs.createWriteStream(localFilePath);
        // await stream.pipe(localWriteStream);

        // // Read the file using fs
        // const fileStream = fs.createReadStream(localFilePath);

        // fs.createReadStream(localFilePath), console.log(fileStream);

        // const fileSizeInKB = bytesToKB(fileSizeInBytes);
        // const fileSizeInMB = bytesToMB(fileSizeInBytes);
        //nadeem

        console.log("=============================");

        console.log(fileSizeInBytes);

        console.log("=============================");

        console.log("Size in Byte: ", fileSizeInBytes);
        console.log("Size in KB: ", fileSizeInKB);
        console.log("Size in MB: ", fileSizeInMB);

        console.log("Final caluclated file size: ", fileSize);

        let arr = filename.split(".");

        let name = arr[0];
        let ext = arr.pop();
        extension = ext;
        if (ExtensionList.includes(ext.toLowerCase())) {
          is_valid_extension = true;
        } else {
          is_valid_extension = false;
        }

        if (!is_valid_extension) {
          return { success: false, message: "Invalid file extension!" };
          // throw new ValidationError("Invalid file extension!");
        }

        let url = path.join(`${name}-${Date.now()}.${ext}`);

        filename_after_uploading = url;
        AWS.config.update({
          accessKeyId: "AKIAUUWI6OUAROXDTLIW",
          secretAccessKey: "Ybsrmc9rxS/jcvmcakNYyw1hBRXSaSijIDx7xRJB",
          //   region: "YOUR_REGION",
        });
        //akram
        const s3 = new AWS.S3();
        const bucketName = "crunos-internal-bucket/test";

        async function uploadFile() {
          const uploadParams = {
            Bucket: bucketName,
            Key: filename_after_uploading,
            Body: readableStream,
          };

          try {
            const data = await s3.upload(uploadParams).promise();
            // console.log("File uploaded successfully. ETag:", data.ETag);
            // console.log(data);
            return data;
          } catch (error) {
            console.error("Error uploading file:", error);
            throw error;
          }
        }

        async function upload_file() {
          return new Promise(async (resolve) => {
            //-------------------------------------
            uploadFile()
              .then(async (data) => {
                console.log("File uploaded successfully:", data);
                file_path_after_uploading = data.Location;

                // console.log(file_path_after_uploading);
                // console.log(filename_after_uploading);

                // Assuming you have saved the uploaded file URL and filename
                fileURL = file_path_after_uploading; // Replace with your file URL
                console.log("file URL: ", file_path_after_uploading);
                const fileName = filename_after_uploading; // Replace with your filename

                // const existingCandidateDocument =
                //   await context.prisma.candidateDocument.findFirst({
                //     where: {
                //       userId,
                //       candidateDocumentTypeId: candidateFileType,
                //     },
                //   });

                // if (existingCandidateDocument) {
                //   // If the record exists, update acceptedTermsConditions
                //   const updatedCandidateDocument =
                //     await context.prisma.candidateDocument.update({
                //       where: {
                //         id: existingCandidateDocument.id,
                //       },
                //       data: {
                //         candidateDocumentTypeId: candidateFileType,
                //         fileName,
                //         fileURL,
                //         fileSize,
                //         fileSizeInBytes,
                //         extension,
                //         fileType,
                //         // acceptedTermsConditions: accepted,
                //       },
                //     });
                //   // console.log(
                //   // "Updated existing candidate document:",
                //   // updatedCandidateDocument
                //   // );
                //   resolve({ success: true, raw: updatedCandidateDocument });
                //   return { success: true, raw: updatedCandidateDocument };
                // }

                // Assuming you have a Prisma instance available in the context
                const newCandidateDocument =
                  await context.prisma.candidateDocument.create({
                    data: {
                      candidateDocumentTypeId: candidateFileType,
                      fileName,
                      fileURL,
                      fileSize,
                      fileSizeInBytes,
                      extension,
                      fileType,
                      userId,
                      // acceptedTermsConditions: accepted,
                    },
                  });
                resolve({ success: true, raw: newCandidateDocument });
                return { success: true, raw: newCandidateDocument };

                // return { success: true, raw: "" };
              })
              .catch((error) => {
                console.error("Error uploading file:", error);
                resolve({ success: false, raw: "" });
                return { success: false, raw: "" };
              });

            //-------------------------------------
          });
        }

        const returnVal = await upload_file();
        return returnVal;
      } // end file uploading if

      console.log("After file upload");
      //============================= resume =============================================
      // return null;
    },
    UpdateMyWorkInformation: async (_, args, context) => {
      const {
        isCurrentLocationDefault,
        isNearMyAddressDefault,
        isWorkInCityDefault,
        workHours,
        workHoursTypeId,
        transportationId,
        jobCategories,
        country,
        state,
        province,
        city,
        currentLocationRadius,
        nearMyAddressRadius,
      } = args;

      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user exists
        const existingUser = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          return { success: false, raw: { message: "User not found!" } };
        }

        // Ensure only one of the boolean flags is true
        const booleanFlags = [
          isCurrentLocationDefault,
          isNearMyAddressDefault,
          isWorkInCityDefault,
        ];
        const trueFlags = booleanFlags.filter((flag) => flag === true);
        if (trueFlags.length !== 1) {
          return {
            success: false,
            raw: { message: "Exactly one of the boolean flags must be true." },
          };
        }

        // Update or clear CandidatePreference
        let preferenceData = {
          isCurrentLocationDefault,
          isNearMyAddressDefault,
          isWorkInCityDefault,
          workHours: null, // Initialize workHours as null
          workHoursTypeId: null, // Initialize workHoursTypeId as null
          transportationId: null,
          userId,
        };

        // Check if transportationId is provided and not an empty string
        if (transportationId !== null && transportationId.trim() !== "") {
          preferenceData = {
            ...preferenceData,
            transportationId, // Assign transportationId only if it's provided
          };
        }

        // Check if workHoursTypeId is provided and not null or empty string
        if (workHoursTypeId && workHoursTypeId.trim() !== "") {
          preferenceData = {
            ...preferenceData,
            workHours, // Assign workHours only if workHoursTypeId is provided
            workHoursTypeId,
          };
        }

        const updatedPreference =
          await context.prisma.candidatePreference.upsert({
            where: { userId },
            create: preferenceData,
            update: preferenceData,
          });

        // Update or clear job categories
        if (jobCategories) {
          if (jobCategories.length > 3) {
            return {
              success: false,
              raw: {
                message: "Only a maximum of 3 job categories are allowed.",
              },
            };
          }

          // Clear existing job categories
          await context.prisma.candidateJobCategory.deleteMany({
            where: { candidateId: userId },
          });

          // Create new job categories
          for (const categoryId of jobCategories) {
            await context.prisma.candidateJobCategory.create({
              data: {
                candidateId: userId,
                categoryId,
                candidatePreferenceId: updatedPreference.id,
              },
            });
          }
        } else {
          // Clear existing job categories
          console.log("Job categories does exists");
          await context.prisma.candidateJobCategory.deleteMany({
            where: { candidateId: userId },
          });
        }

        // Update or clear currentLocationRadius in CandidateAddress
        const currentLocationData = {
          radius: currentLocationRadius,
        };

        if (currentLocationRadius !== null) {
          // Check if a record with the given userId and candidateAddressTypeId exists
          const existingCurrentLocation =
            await context.prisma.candidateAddress.findFirst({
              where: {
                userId,
                candidateAddressTypeId: "2e42c035-a10f-463f-8ca5-a335ed1e504b",
              },
            });

          if (existingCurrentLocation) {
            // Update the existing record
            await context.prisma.candidateAddress.update({
              where: {
                id: existingCurrentLocation.id,
              },
              data: currentLocationData,
            });
          } else {
            // Create a new record
            await context.prisma.candidateAddress.create({
              data: {
                ...currentLocationData,
                userId,
                candidateAddressTypeId: "2e42c035-a10f-463f-8ca5-a335ed1e504b",
              },
            });
          }
        } else {
          // Delete the address if radius is null
          await context.prisma.candidateAddress.deleteMany({
            where: {
              userId,
              candidateAddressTypeId: "2e42c035-a10f-463f-8ca5-a335ed1e504b",
            },
          });
        }

        // Update or clear nearMyAddressRadius in CandidateAddress
        const nearMyAddressData = {
          radius: nearMyAddressRadius,
        };

        if (nearMyAddressRadius !== null) {
          // Check if a record with the given userId and candidateAddressTypeId exists
          const existingNearMyAddress =
            await context.prisma.candidateAddress.findFirst({
              where: {
                userId,
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            });

          if (existingNearMyAddress) {
            // Update the existing record
            await context.prisma.candidateAddress.update({
              where: {
                id: existingNearMyAddress.id,
              },
              data: nearMyAddressData,
            });
          } else {
            // Create a new record
            await context.prisma.candidateAddress.create({
              data: {
                ...nearMyAddressData,
                userId,
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            });
          }
        } else {
          // Delete the address if radius is null
          await context.prisma.candidateAddress.deleteMany({
            where: {
              userId,
              candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
            },
          });
        }

        // Update or clear CandidateAddress
        const addressData = {
          country,
          state,
          province,
          city,
        };

        const whereCondition = {
          userId,
          candidateAddressTypeId: "ecd2af27-3783-42ff-93b5-81568d205ae6",
        };

        if (!country && !city) {
          // Delete the address if both country and city are not provided
          await context.prisma.candidateAddress.deleteMany({
            where: whereCondition,
          });
        } else {
          // Check if a record with the given `userId` and `candidateAddressTypeId` exists
          const existingAddress =
            await context.prisma.candidateAddress.findFirst({
              where: whereCondition,
            });

          if (existingAddress) {
            // Update the existing record
            await context.prisma.candidateAddress.update({
              where: {
                id: existingAddress.id,
              },
              data: addressData,
            });
          } else {
            // Create a new record
            await context.prisma.candidateAddress.create({
              data: {
                ...addressData,
                userId,
                candidateAddressTypeId: "ecd2af27-3783-42ff-93b5-81568d205ae6",
              },
            });
          }
        }

        return { success: true, raw: updatedPreference };
      } catch (error) {
        return { success: false, raw: { message: error.message } };
      }
    },

    UpdatePersonalInformation: async (_, args, context) => {
      const {
        name,
        contactNo,
        permanentAddress,
        dateOfBirth,
        emergencyContact,
      } = args;

      try {
        // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

        console.log("----------------------------------------------");
        let userId = null;

        userId = await validateCognitoToken(context.token);
        try {
          if (userId) {
            console.log("Token is valid. User ID:", userId);
          } else {
            console.log("Token is invalid or expired.");
            throw new Error("Invalid token!");
          }
        } catch (error) {
          console.error("An error occurred:", error);
          throw new Error("Invalid token!", error);
        }
        console.log("----------------------------------------------");
        // Fetch the user
        let user = await context.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          return { success: false, raw: { message: "User not found!" } };
        }

        // Update or clear name fields
        if (name) {
          const nameParts = name.split(" ");
          const firstName = nameParts[0] || null;
          const middleName = nameParts[1] || null;
          const lastName = nameParts[2] || null;

          user = await context.prisma.user.update({
            where: { id: userId },
            data: {
              firstName,
              middleName,
              lastName,
            },
          });
        } else {
          // Clear name fields
          user = await context.prisma.user.update({
            where: { id: userId },
            data: {
              firstName: null,
              middleName: null,
              lastName: null,
            },
          });
        }

        // Update or clear date of birth
        if (dateOfBirth) {
          user = await context.prisma.user.update({
            where: { id: userId },
            data: {
              dateOfBirth,
            },
          });
        } else {
          // Clear date of birth
          user = await context.prisma.user.update({
            where: { id: userId },
            data: {
              dateOfBirth: null,
            },
          });
        }

        // Update or clear contact number
        if (contactNo) {
          const existingContact = await context.prisma.candidatePhone.findFirst(
            {
              where: {
                userId: userId,
                candidatePhoneTypeId: "a91144a1-8e5a-4b84-8f94-bf06f1152a1c",
              },
            }
          );

          if (existingContact) {
            // If the contact exists, update it
            await context.prisma.candidatePhone.update({
              where: {
                id: existingContact.id,
              },
              data: {
                number: contactNo,
              },
            });
          } else {
            // If the contact doesn't exist, create it
            await context.prisma.candidatePhone.create({
              data: {
                userId,
                number: contactNo,
                candidatePhoneTypeId: "a91144a1-8e5a-4b84-8f94-bf06f1152a1c",
              },
            });
          }
        } else {
          // Clear contact number
          await context.prisma.candidatePhone.deleteMany({
            where: {
              userId: userId,
              candidatePhoneTypeId: "a91144a1-8e5a-4b84-8f94-bf06f1152a1c",
            },
          });
        }

        // Update or clear emergency contact
        if (emergencyContact) {
          const existingEmergencyContact =
            await context.prisma.candidatePhone.findFirst({
              where: {
                userId: userId,
                candidatePhoneTypeId: "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e",
              },
            });

          if (existingEmergencyContact) {
            // If the emergency contact exists, update it
            await context.prisma.candidatePhone.update({
              where: {
                id: existingEmergencyContact.id,
              },
              data: {
                number: emergencyContact,
              },
            });
          } else {
            // If the emergency contact doesn't exist, create it
            await context.prisma.candidatePhone.create({
              data: {
                userId,
                number: emergencyContact,
                candidatePhoneTypeId: "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e",
              },
            });
          }
        } else {
          // Clear emergency contact
          await context.prisma.candidatePhone.deleteMany({
            where: {
              userId: userId,
              candidatePhoneTypeId: "56e4bc6e-620c-40f5-aaa0-22d6e2066c4e",
            },
          });
        }

        // Update or clear permanent address
        if (permanentAddress) {
          const existingAddress =
            await context.prisma.candidateAddress.findFirst({
              where: {
                userId: userId,
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            });

          if (existingAddress) {
            // If the address exists, update it
            await context.prisma.candidateAddress.update({
              where: {
                id: existingAddress.id,
              },
              data: {
                location: permanentAddress,
              },
            });
          } else {
            // If the address doesn't exist, create it
            await context.prisma.candidateAddress.create({
              data: {
                userId,
                latitude: 49.03,
                longitude: -73.04,
                location: permanentAddress,
                candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
              },
            });
          }
        } else {
          // Clear permanent address
          await context.prisma.candidateAddress.deleteMany({
            where: {
              userId: userId,
              candidateAddressTypeId: "7d49edb5-ea56-42f4-a21a-c182c851afdf",
            },
          });
        }

        return { success: true, raw: user };
      } catch (error) {
        return { success: false, raw: { message: error.message } };
      }
    },

     AddWorkExperience : async (_, args, context) => {
      const { jobTitle, company, startDate, endDate, isCurrentPosition, description } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the user
        let user = await context.prisma.user.findUnique({
          where: { id: userId },
          include: { workExperiences: true },
        });
    
        if (!user) {
          return {
            success: false,
            message: 'User not found!',
            raw: null,
          };
        }
    
        // Ensure the user does not exceed the maximum allowed work experiences (30 in this case)
        if (user.workExperiences.length >= 30) {
          return {
            success: false,
            message: 'Maximum limit of work experiences reached.',
            raw: null,
          };
        }
    
        // Add work experience
        const newWorkExperience = await context.prisma.workExperience.create({
          data: {
            jobTitle,
            company,
            startDate,
            endDate,
            isCurrentPosition: isCurrentPosition || false,
            description,
            userId,
          },
        });
    
        return {
          success: true,
          message: 'Work experience added successfully.',
          raw: newWorkExperience,
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          raw: null,
        };
      }
    },


     UpdateWorkExperience : async (_, args, context) => {
      const { id, jobTitle, company, startDate, endDate, isCurrentPosition, description } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the work experience entry
        let workExperience = await context.prisma.workExperience.findUnique({
          where: { id: id },
        });
    
        if (!workExperience || workExperience.userId !== userId) {
          return {
            success: false,
            message: 'Work experience not found or unauthorized to update.',
            workExperience: null,
          };
        }
    
        // Update work experience
        workExperience = await context.prisma.workExperience.update({
          where: { id: id },
          data: {
            jobTitle: jobTitle || workExperience.jobTitle,
            company: company || workExperience.company,
            startDate: startDate || workExperience.startDate,
            endDate: endDate || workExperience.endDate,
            isCurrentPosition: isCurrentPosition !== undefined ? isCurrentPosition : workExperience.isCurrentPosition,
            description: description || workExperience.description,
          },
        });
    
        return {
          success: true,
          message: 'Work experience updated successfully.',
          raw: workExperience,
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          raw: null,
        };
      }
    },


     DeleteWorkExperience : async (_, args, context) => {
      const { id } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the work experience entry
        const workExperience = await context.prisma.workExperience.findUnique({
          where: { id: id },
        });
    
        if (!workExperience || workExperience.userId !== userId) {
          return {
            success: false,
            message: 'Work experience not found or unauthorized to delete.',
          };
        }
    
        // Delete work experience
        await context.prisma.workExperience.delete({
          where: { id: id },
        });
    
        return {
          success: true,
          message: 'Work experience deleted successfully.',
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
        };
      }
    },



     AddEducation : async (_, args, context) => {
      const { levelOfEducation, institutionName, fieldOfStudy, startDate, endDate, isInProgress } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Add education
        const newEducation = await context.prisma.education.create({
          data: {
            levelOfEducation,
            institutionName,
            fieldOfStudy,
            startDate,
            endDate,
            isInProgress: isInProgress || false,
            userId,
          },
        });
    
        return {
          success: true,
          message: 'Education added successfully.',
          raw: newEducation,
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          raw: null,
        };
      }
    },



     UpdateEducation : async (_, args, context) => {
      const { id, levelOfEducation, institutionName, fieldOfStudy, startDate, endDate, isInProgress } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the education entry
        let education = await context.prisma.education.findUnique({
          where: { id: id },
        });
    
        if (!education || education.userId !== userId) {
          return {
            success: false,
            message: 'Education not found or unauthorized to update.',
            education: null,
          };
        }
    
        // Update education
        education = await context.prisma.education.update({
          where: { id: id },
          data: {
            levelOfEducation: levelOfEducation || education.levelOfEducation,
            institutionName: institutionName || education.institutionName,
            fieldOfStudy: fieldOfStudy || education.fieldOfStudy,
            startDate: startDate || education.startDate,
            endDate: endDate || education.endDate,
            isInProgress: isInProgress !== undefined ? isInProgress : education.isInProgress,
          },
        });
    
        return {
          success: true,
          message: 'Education updated successfully.',
          raw: education,
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          raw: null,
        };
      }
    },




     DeleteEducation : async (_, args, context) => {
      const { id } = args;
    
      try {
        // Validate user token
        const userId = await validateCognitoToken(context.token);
    
        // Fetch the education entry
        const education = await context.prisma.education.findUnique({
          where: { id: id },
        });
    
        if (!education || education.userId !== userId) {
          return {
            success: false,
            message: 'Education not found or unauthorized to delete.',
          };
        }
    
        // Delete education
        await context.prisma.education.delete({
          where: { id: id },
        });
    
        return {
          success: true,
          message: 'Education deleted successfully.',
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
        };
      }
    },


    DeleteSearchHistory: async (_, { id }, context) => {
      try {
        // Check if a specific record deletion is requested
        if (id) {
          const recordToDelete =
            await context.prisma.candidateJobSearchHistory.findUnique({
              where: { id: id },
            });

          if (!recordToDelete) {
            throw new Error(`Record with ID ${id} does not exist.`);
          }

          // Delete the record
          await context.prisma.candidateJobSearchHistory.delete({
            where: { id: id },
          });
        } else {
          return { success: false };
        }
        // Retrieve the search history
        // const searchHistory =
        //   await context.prisma.candidateJobSearchHistory.findMany({
        //     orderBy: { createdAt: "desc" },
        //     skip: skip,
        //     take: take,
        //   });

        return { success: true };
      } catch (error) {
        // throw new Error(`Failed to retrieve search history: ${error.message}`);
        return { success: false, raw: error };
      }
    },

    SetUserLocation: async (_, { latitude, longitude }, context) => {
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      if (!userId || !latitude || !longitude) {
        throw new Error("Invalid input data.");
      }

      let location = "";
      try {
        const result = await reverseGeocode(latitude, longitude);
        if (result === null) {
          console.log("result = null");
          location = "";
          // return {
          //   error: "Unable to find location for the given coordinates.",
          // };
        } else {
          location = result.address;
        }
      } catch (error) {
        console.log(error);
        location = "";
        // return { error: error.message };
      }

      try {
        const updatedAddress = await updateAddress(
          userId,
          latitude,
          longitude,
          location,
          context.prisma
        );
        return {
          success: true,
          latitude: latitude,
          longitude: longitude,
          location: location,
        };
      } catch (error) {
        console.error(error);
        return {
          success: true,
          latitude: latitude,
          longitude: longitude,
          location: location,
          raw: error,
        };
        // throw new Error("An error occurred while setting user location.");
      }
    },
    RevokeJobApplication: async (parent, args, context) => {
      const { applicationId } = args;
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        // Check if the job application exists and belongs to the user
        const jobApplication = await context.prisma.jobApplication.findUnique({
          where: {
            id: applicationId,
          },
          select: {
            id: true,
            candidate: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!jobApplication) {
          throw new Error("Job application not found");
        }

        if (jobApplication.candidate.id !== userId) {
          throw new Error("Job application does not belong to the user");
        }

        // Delete the job application
        await context.prisma.jobApplication.delete({
          where: {
            id: applicationId,
          },
        });

        return { success: true, raw: jobApplication };
      } catch (error) {
        console.error("Error revoking job application:", error);

        return { success: false, raw: error };
        // throw new Error("Could not revoke job application.");
      }
    },

    ApplyToJob: async (parent, args, context) => {
      const { jobId, resumeId } = args;
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      const openStatusIds = [
        "d42ea4eb-b130-4a25-8d81-206e1fce5d48",
        // "875e229d-8001-4290-acdf-fd20410d4cb6",
      ];

      try {
        // Check if the job exists and is open
        const job = await context.prisma.job.findUnique({
          where: {
            id: jobId,
          },
          select: {
            id: true,
            status: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!job) {
          throw new Error("Job not found");
        }

        const isJobOpen = openStatusIds.includes(job.status.id);

        if (!isJobOpen) {
          throw new Error("Job is not open for applications");
        }

        // Check if the user has already applied to this job
        const existingApplication =
          await context.prisma.jobApplication.findFirst({
            where: {
              jobId: jobId,
              candidateId: userId,
            },
          });

        if (existingApplication) {
          return { success: true, raw: existingApplication };
        }

        // Create a job application
        const jobApplication = await context.prisma.jobApplication.create({
          data: {
            job: {
              connect: {
                id: jobId,
              },
            },
            candidate: {
              connect: {
                id: userId,
              },
            },
            resumeId: resumeId,
            status: {
              connect: {
                id: "80e9fe50-0a04-40b4-8f42-a7add1fecb12",
              },
            },
          },
        });

        return { success: true, raw: jobApplication };
      } catch (error) {
        console.error("Error applying to job:", error);
        return { success: false, raw: error };
        // throw new Error("Could not apply to job.");
      }
    },
    BookmarkJob: async (parent, args, context) => {
      const { jobId } = args;
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");

      try {
        // Check if the user and job exist
        const user = await context.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          throw new Error(`User with ID ${userId} not found.`);
        }

        const job = await context.prisma.job.findUnique({
          where: { id: jobId },
        });
        if (!job) {
          throw new Error(`Job with ID ${jobId} not found.`);
        }

        // Check if the bookmark already exists
        const existingBookmark = await context.prisma.bookmark.findFirst({
          where: {
            userId: userId,
            jobId: jobId,
          },
        });

        if (existingBookmark) {
          // Job is already bookmarked, return the existing bookmark
          // return existingBookmark;

          throw new Error(`Job with ID ${jobId} is already bookmarked.`);
        }

        // Create the bookmark
        const bookmark = await context.prisma.bookmark.create({
          data: {
            userId: userId,
            jobId: jobId,
          },
        });

        return bookmark;
      } catch (error) {
        console.error("Error bookmarking job:", error);
        throw new Error("Could not bookmark job.");
      }
    },
    UnbookmarkJob: async (parent, args, context) => {
      const { jobId } = args;
      // const userId = "d7bdcba2-aa31-4604-b7c6-594968475186";

      console.log("----------------------------------------------");
      let userId = null;

      userId = await validateCognitoToken(context.token);
      try {
        if (userId) {
          console.log("Token is valid. User ID:", userId);
        } else {
          console.log("Token is invalid or expired.");
          throw new Error("Invalid token!");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        throw new Error("Invalid token!", error);
      }
      console.log("----------------------------------------------");
      try {
        // Check if the user and job exist
        const user = await context.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          throw new Error(`User with ID ${userId} not found.`);
        }

        const job = await context.prisma.job.findUnique({
          where: { id: jobId },
        });
        if (!job) {
          throw new Error(`Job with ID ${jobId} not found.`);
        }

        // Check if the bookmark exists
        const existingBookmark = await context.prisma.bookmark.findFirst({
          where: {
            userId: userId,
            jobId: jobId,
          },
        });

        if (!existingBookmark) {
          throw new Error(`Job with ID ${jobId} is not bookmarked.`);
        }

        // Delete the bookmark
        await context.prisma.bookmark.delete({
          where: {
            id: existingBookmark.id,
          },
        });

        return existingBookmark;
      } catch (error) {
        console.error("Error unbookmarking job:", error);
        throw new Error("Could not unbookmark job.");
      }
    },
  },
};

module.exports = { resolvers };
