// // Pipleline

// // index.js
// const jwt = require("jsonwebtoken");
// require("dotenv").config();

// const jwt_decode = require("jwt-decode");
// const express = require("express");
// //const { ApolloServer } = require("apollo-server");
// const {
//   ApolloServer,
//   AuthenticationError,
//   ValidationError,
//   UserInputError,
//   ForbiddenError,
//   PersistedQueryNotFoundError,
//   PersistedQueryNotSupportedError,
// } = require("apollo-server-lambda");
// // const { ApolloServer, gql } = require("apollo-server-express");
// const {
//   GraphQLUpload,
//   graphqlUploadExpress, // A Koa implementation is also exported.
// } = require("graphql-upload");
// // const { finished } = require("stream/promises");
// const { readFileSync } = require("fs");
// const path = require("path");
// const { PrismaClient } = require("@prisma/client");
// const { resolvers } = require("./resolvers.js");

// const prisma = new PrismaClient();

// // const server = new ApolloServer({
// //   typeDefs: readFileSync(path.join(__dirname, "schema.graphql"), "utf8"),
// //   resolvers,
// //   context: {
// //     prisma,
// //   },
// // });
// // exports.graphqlHandler = server.createHandler();
// //server.listen().then(({ url }) => console.log(`Server is running on ${url}`));

// //-------------------
// // async function startServer() {
// const server = new ApolloServer({
//   typeDefs: readFileSync(path.join(__dirname, "schema.graphql"), "utf8"),
//   resolvers,
//   context: ({ event }) => {
//     const obj = { prisma };

//     // Note: This example uses the `req` argument to access headers,
//     // but the arguments received by `context` vary by integration.
//     // This means they vary for Express, Koa, Lambda, etc.
//     //
//     // To find out the correct arguments for a specific integration,
//     // see https://www.apollographql.com/docs/apollo-server/api/apollo-server/#middleware-specific-context-fields

//     // Get the user token from the headers.

//     //Triage
//     // var token =
//     //   "eyJraWQiOiJwVEF0cnVJMElwSVFoRUxuZTR5YnRwS3htM3dkS3hzWjlodDRvcUZROXNJPSIsImFsZyI6IlJTMjU2In0.eyJjdXN0b206bWlkZGxlX25hbWUiOiIgIiwic3ViIjoiNzJhYmQ5YTctODMwNi00OTA4LThlY2MtMzhmMTgyM2FjMmUxIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0yX09DaXUzQ3czUSIsImN1c3RvbTp1c2VyX2lkIjoiM2E2YzI5OTUtMmFjNy00YTJmLWIxMTItNjA4MjkyOTNhYTA2IiwiY3VzdG9tOmdyb3VwIjoiVHJpYWdlIiwiY29nbml0bzp1c2VybmFtZSI6IjcyYWJkOWE3LTgzMDYtNDkwOC04ZWNjLTM4ZjE4MjNhYzJlMSIsIm9yaWdpbl9qdGkiOiI1YzVjOGVkYi03MzkzLTRkMTMtYjY5ZC00ZjQxNjk5ZmFmMzAiLCJjdXN0b206UmVhbF9Fc3RhdGVfSUQiOiIgIiwiYXVkIjoiNG91b2cyMDVhMTY5ZWQydWN2Yjc5ZjJvbGkiLCJjdXN0b206bGFzdF9uYW1lIjoiYWhtYWQiLCJldmVudF9pZCI6IjBmOGI5ZTk1LWM3OTAtNDc4NC04NjBhLWU2NjUwYmJjYmUyZSIsImN1c3RvbTpmaXJzdF9uYW1lIjoiZmlyZG91cyIsInRva2VuX3VzZSI6ImlkIiwiY3VzdG9tOnJlbmV3VGltZSI6IlR1ZSBBcHIgMTkgMjAyMiAxMzo0MjoxMiBHTVQrMDAwMCAoQ29vcmRpbmF0ZWQgVW5pdmVyc2FsIFRpbWUpIiwiYXV0aF90aW1lIjoxNjUwNDM3MzY4LCJleHAiOjE2NTA0NDA5NjgsImlhdCI6MTY1MDQzNzM2OCwianRpIjoiYjk3NDEyNmQtNjRkMS00N2NmLThjMmYtMzU4MmFmMmVlMWM4IiwiZW1haWwiOiJmaXJkb3Vza2hvc2FAZ21haWwuY29tIn0.OOJUKYARWVwk968gFS8qI33tT2JN8hB_dmQ8y6B64elFI_QZ7vErYcoi3h6RjuRkil1jrNEF7nBTqodTEpGsxJc_TTqi9TsQhPVMq-IIXP2FLsOnFPG4nY0MVTA1N8m4TS_3KAb7ULAoRHN0s5Qr_wrdW1uEIuAToUex70tmEvz-5fWHAs6u_OKvp6OKo1CxL_FZCW_Bq6gFoWqvjrlHcxcz4gBJJKbbRtYHX2i3z_vDiM6qoFcrMSjIy5_MNiHcnvqB23Q3dRPJgrk3GNsIvKKRzxngf5bp5oNtRs5HuWFwbOkoQlRoDmpiO1h9VDXOEQSA1DemqMwWVi32QhoFkQ";

//     //External
//     // var token =
//     //   "eyJraWQiOiJwVEF0cnVJMElwSVFoRUxuZTR5YnRwS3htM3dkS3hzWjlodDRvcUZROXNJPSIsImFsZyI6IlJTMjU2In0.eyJjdXN0b206bWlkZGxlX25hbWUiOiIgIiwic3ViIjoiY2FiOTA4MmItM2IwMi00NDU1LTgyOWMtMWYxYTE2MTliZGIzIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0yX09DaXUzQ3czUSIsImN1c3RvbTp1c2VyX2lkIjoiY2VjYjI1OTYtMzJhOS00NWZlLWE4NzctNGQwMWYwYTgwMjY4IiwiY29nbml0bzp1c2VybmFtZSI6ImNhYjkwODJiLTNiMDItNDQ1NS04MjljLTFmMWExNjE5YmRiMyIsIm9yaWdpbl9qdGkiOiI2ZWMxMWUxZC1hOWYzLTRmMGEtOTMyZS1iNzM0YjkxODRiOTgiLCJjdXN0b206UmVhbF9Fc3RhdGVfSUQiOiIgIiwiYXVkIjoiNG91b2cyMDVhMTY5ZWQydWN2Yjc5ZjJvbGkiLCJjdXN0b206bGFzdF9uYW1lIjoiamF3YWlkIiwiZXZlbnRfaWQiOiJlMmJlNDYzYy0xYzkyLTQ3YjEtYmU5Ni0xNzU3YzU4ZjU2MmIiLCJjdXN0b206Zmlyc3RfbmFtZSI6InphaW5hYiIsInRva2VuX3VzZSI6ImlkIiwiY3VzdG9tOnJlbmV3VGltZSI6Ik1vbiBBcHIgMTggMjAyMiAxNzo0NzozMyBHTVQrMDUwMCAoUGFraXN0YW4gU3RhbmRhcmQgVGltZSkiLCJhdXRoX3RpbWUiOjE2NTA0MzgxMDEsImV4cCI6MTY1MDQ0MTcwMSwiaWF0IjoxNjUwNDM4MTAxLCJqdGkiOiIyMjIyZWUyMC1lN2U1LTRlM2ItODhkNS1lNGNjMTM0OTkzYjYiLCJlbWFpbCI6Im1lbW9uaWJhNzg2QGdtYWlsLmNvbSJ9.muI6Wi_MmaTQlVpZMJTGnPEsIwqyOhFSQtJw-lUGh1lpBg6WYC1fLAqjgfWDSS54b4ZuHhSAw0lkgwP5LtrYCbTzuHqxh0ez2ldQhXzyRA5PZCPeRSSrC5wcSDZtmiL38dZ_lerR7Y_QFZCKnnppvpEjaHe5i7_GWs8k9N2topWffsTdMR4o8uPjmzNyJxFGbW0NZboWNFokeV03pz08BDz7yel-ExGCRcm0QSdjPmXquzeI1Zn8HhlEimHumAussMqWNT5oe-SVGxtHje18j3yDFzdREoWCNpND2D7TSWYVSy6Y5ggbd-3fZG04YrV8L8bae_fZqTX7Ed8Y4kHufg";

//     // console.log(event.headers);

//     const token = event.headers.Authorization || null;

//     console.log("-----------------Before Decode--------------------");
//     console.log(token);

//     if (!token) {
//       throw new AuthenticationError("You must be logged in!");
//     }

//     // token.replace("Bearer ","");

//     var decoded = jwt_decode(token);

//     if (decoded.sub) {
//       console.log("-----------------After Decode--------------------");
//       console.log(decoded);

//       // var userTypeFromToken = "External";

//       // //console.log(decoded["custom:group"]);

//       // if (decoded.hasOwnProperty("custom:group")) {
//       //   userTypeFromToken = decoded["custom:group"];
//       // }

//       // // console.log(decoded.sub);
//       // // console.log(userTypeFromToken);

//       // obj.userTypeFromToken = userTypeFromToken;
//       // obj.userIdFromToken = decoded.sub;

//       // console.log("-----------------User Type--------------------");
//       // console.log(userTypeFromToken);

//       // if (!decoded["custom:group"]) {
//       //   userType = "Internal";
//       // } else {
//       //   userType = decoded["custom:group"];
//       // }

//       //const token = req.headers.authorization || "";

//       // Try to retrieve a user with the token
//       //const user = "null";

//       // optionally block the user
//       // we could also check user roles/permissions here
//       // if (!user) throw new AuthenticationError("you must be logged in");

//       //obj.user = user;

//       // Add the user to the context
//       obj.token = token;
//       return obj;
//     } else {
//       // token.replace("Bearer ","");

//       throw new AuthenticationError(
//         "Please provide a token to authorized otherwise you are unauthorized!"
//       );

//       // Add the user to the context
//       // const name = decoded.id;

//       //   obj.name = decoded.id;

//       //   obj.userTypeFromToken = "triage";
//       //   obj.userIdFromToken = "1a7bb02a-e615-4f85-bd6e-331a5df37dbe";
//       // });

//       // return obj;
//     }
//   },
// });

// // await server.start();

// //   server.applyMiddleware({ app });

// // await new Promise((r) => app.listen({ port: 4000 }, r));

// //console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);

// //server.listen().then(({ url }) => console.log(`Server is running on ${url}`));

// //   return server;

// // exports.graphqlHandler = server.createHandler();
// // }

// // startServer();

// exports.graphqlHandler = server.createHandler({
//   expressGetMiddlewareOptions: {
//     cors: {
//       origin: "*",
//       credentials: true,
//     },
//   },
//   expressAppFromMiddleware(middleware) {
//     const app = express();
//     // This middleware should be added before calling `applyMiddleware`.
//     app.use(graphqlUploadExpress());

//     // app.use(someOtherMiddleware);
//     app.use(middleware);

//     //   const app = express();
//     // default options
//     // app.use(fileUpload());

//     return app;
//   },
// });

// // // // // -------------------------------------------------------------------------------------------

// // local
// // index.js
// const express = require("express");
// // const fileUpload = require("express-fileupload");
// //const { ApolloServer } = require("apollo-server");
// // const { ApolloServer } = require("apollo-server-lambda");
// const { ApolloServer, gql } = require("apollo-server-express");
// const jwt = require("jsonwebtoken");
// const jwt_decode = require("jwt-decode");
// require("dotenv").config();
// const {
//   GraphQLUpload,
//   graphqlUploadExpress, // A Koa implementation is also exported.
// } = require("graphql-upload");
// // const { finished } = require("stream/promises");
// const { readFileSync } = require("fs");
// const path = require("path");
// const { PrismaClient } = require("@prisma/client");
// const { resolvers } = require("./resolvers.js");

// const prisma = new PrismaClient();

// //-------------------
// async function startServer() {
//   const server = new ApolloServer({
//     typeDefs: readFileSync(path.join(__dirname, "schema.graphql"), "utf8"),
//     resolvers,
//     context: ({ req }) => {
//       const obj = { prisma };

//       // Note: This example uses the `req` argument to access headers,
//       // but the arguments received by `context` vary by integration.
//       // This means they vary for Express, Koa, Lambda, etc.
//       //
//       // To find out the correct arguments for a specific integration,
//       // see https://www.apollographql.com/docs/apollo-server/api/apollo-server/#middleware-specific-context-fields

//       // Get the user token from the headers.

//       //Triage
//       // var token =
//       //   "eyJraWQiOiJwVEF0cnVJMElwSVFoRUxuZTR5YnRwS3htM3dkS3hzWjlodDRvcUZROXNJPSIsImFsZyI6IlJTMjU2In0.eyJjdXN0b206bWlkZGxlX25hbWUiOiIgIiwic3ViIjoiNzJhYmQ5YTctODMwNi00OTA4LThlY2MtMzhmMTgyM2FjMmUxIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0yX09DaXUzQ3czUSIsImN1c3RvbTp1c2VyX2lkIjoiM2E2YzI5OTUtMmFjNy00YTJmLWIxMTItNjA4MjkyOTNhYTA2IiwiY3VzdG9tOmdyb3VwIjoiVHJpYWdlIiwiY29nbml0bzp1c2VybmFtZSI6IjcyYWJkOWE3LTgzMDYtNDkwOC04ZWNjLTM4ZjE4MjNhYzJlMSIsIm9yaWdpbl9qdGkiOiI1YzVjOGVkYi03MzkzLTRkMTMtYjY5ZC00ZjQxNjk5ZmFmMzAiLCJjdXN0b206UmVhbF9Fc3RhdGVfSUQiOiIgIiwiYXVkIjoiNG91b2cyMDVhMTY5ZWQydWN2Yjc5ZjJvbGkiLCJjdXN0b206bGFzdF9uYW1lIjoiYWhtYWQiLCJldmVudF9pZCI6IjBmOGI5ZTk1LWM3OTAtNDc4NC04NjBhLWU2NjUwYmJjYmUyZSIsImN1c3RvbTpmaXJzdF9uYW1lIjoiZmlyZG91cyIsInRva2VuX3VzZSI6ImlkIiwiY3VzdG9tOnJlbmV3VGltZSI6IlR1ZSBBcHIgMTkgMjAyMiAxMzo0MjoxMiBHTVQrMDAwMCAoQ29vcmRpbmF0ZWQgVW5pdmVyc2FsIFRpbWUpIiwiYXV0aF90aW1lIjoxNjUwNDM3MzY4LCJleHAiOjE2NTA0NDA5NjgsImlhdCI6MTY1MDQzNzM2OCwianRpIjoiYjk3NDEyNmQtNjRkMS00N2NmLThjMmYtMzU4MmFmMmVlMWM4IiwiZW1haWwiOiJmaXJkb3Vza2hvc2FAZ21haWwuY29tIn0.OOJUKYARWVwk968gFS8qI33tT2JN8hB_dmQ8y6B64elFI_QZ7vErYcoi3h6RjuRkil1jrNEF7nBTqodTEpGsxJc_TTqi9TsQhPVMq-IIXP2FLsOnFPG4nY0MVTA1N8m4TS_3KAb7ULAoRHN0s5Qr_wrdW1uEIuAToUex70tmEvz-5fWHAs6u_OKvp6OKo1CxL_FZCW_Bq6gFoWqvjrlHcxcz4gBJJKbbRtYHX2i3z_vDiM6qoFcrMSjIy5_MNiHcnvqB23Q3dRPJgrk3GNsIvKKRzxngf5bp5oNtRs5HuWFwbOkoQlRoDmpiO1h9VDXOEQSA1DemqMwWVi32QhoFkQ";

//       //External
//       // var token =
//       //   "eyJraWQiOiJwVEF0cnVJMElwSVFoRUxuZTR5YnRwS3htM3dkS3hzWjlodDRvcUZROXNJPSIsImFsZyI6IlJTMjU2In0.eyJjdXN0b206bWlkZGxlX25hbWUiOiIgIiwic3ViIjoiY2FiOTA4MmItM2IwMi00NDU1LTgyOWMtMWYxYTE2MTliZGIzIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0yX09DaXUzQ3czUSIsImN1c3RvbTp1c2VyX2lkIjoiY2VjYjI1OTYtMzJhOS00NWZlLWE4NzctNGQwMWYwYTgwMjY4IiwiY29nbml0bzp1c2VybmFtZSI6ImNhYjkwODJiLTNiMDItNDQ1NS04MjljLTFmMWExNjE5YmRiMyIsIm9yaWdpbl9qdGkiOiI2ZWMxMWUxZC1hOWYzLTRmMGEtOTMyZS1iNzM0YjkxODRiOTgiLCJjdXN0b206UmVhbF9Fc3RhdGVfSUQiOiIgIiwiYXVkIjoiNG91b2cyMDVhMTY5ZWQydWN2Yjc5ZjJvbGkiLCJjdXN0b206bGFzdF9uYW1lIjoiamF3YWlkIiwiZXZlbnRfaWQiOiJlMmJlNDYzYy0xYzkyLTQ3YjEtYmU5Ni0xNzU3YzU4ZjU2MmIiLCJjdXN0b206Zmlyc3RfbmFtZSI6InphaW5hYiIsInRva2VuX3VzZSI6ImlkIiwiY3VzdG9tOnJlbmV3VGltZSI6Ik1vbiBBcHIgMTggMjAyMiAxNzo0NzozMyBHTVQrMDUwMCAoUGFraXN0YW4gU3RhbmRhcmQgVGltZSkiLCJhdXRoX3RpbWUiOjE2NTA0MzgxMDEsImV4cCI6MTY1MDQ0MTcwMSwiaWF0IjoxNjUwNDM4MTAxLCJqdGkiOiIyMjIyZWUyMC1lN2U1LTRlM2ItODhkNS1lNGNjMTM0OTkzYjYiLCJlbWFpbCI6Im1lbW9uaWJhNzg2QGdtYWlsLmNvbSJ9.muI6Wi_MmaTQlVpZMJTGnPEsIwqyOhFSQtJw-lUGh1lpBg6WYC1fLAqjgfWDSS54b4ZuHhSAw0lkgwP5LtrYCbTzuHqxh0ez2ldQhXzyRA5PZCPeRSSrC5wcSDZtmiL38dZ_lerR7Y_QFZCKnnppvpEjaHe5i7_GWs8k9N2topWffsTdMR4o8uPjmzNyJxFGbW0NZboWNFokeV03pz08BDz7yel-ExGCRcm0QSdjPmXquzeI1Zn8HhlEimHumAussMqWNT5oe-SVGxtHje18j3yDFzdREoWCNpND2D7TSWYVSy6Y5ggbd-3fZG04YrV8L8bae_fZqTX7Ed8Y4kHufg";

//       // console.log(event.headers);

//       // const token = req.headers.authorization || null;

//       // // console.log("-----------------Before Decode--------------------");
//       // // console.log(token);

//       // if (!token) {
//       //   throw new AuthenticationError("You must be logged in!");
//       // }

//       // token.replace("Bearer ","");

//       // var decoded = jwt_decode(token);

//       // if (decoded.sub) {
//       //   console.log("-----------------After Decode--------------------");
//       //   console.log(decoded);

//       //   var userTypeFromToken = "External";

//       //   //console.log(decoded["custom:group"]);

//       //   if (decoded.hasOwnProperty("custom:group")) {
//       //     userTypeFromToken = decoded["custom:group"];
//       //   }

//       //   // console.log(decoded.sub);
//       //   // console.log(userTypeFromToken);

//       //   obj.userTypeFromToken = userTypeFromToken;
//       //   obj.userIdFromToken = decoded.sub;

//       //   // console.log("-----------------User Type--------------------");
//       //   // console.log(userTypeFromToken);

//       //   // if (!decoded["custom:group"]) {
//       //   //   userType = "Internal";
//       //   // } else {
//       //   //   userType = decoded["custom:group"];
//       //   // }

//       //   //const token = req.headers.authorization || "";

//       //   // Try to retrieve a user with the token
//       //   //const user = "null";

//       //   // optionally block the user
//       //   // we could also check user roles/permissions here
//       //   // if (!user) throw new AuthenticationError("you must be logged in");

//       //   //obj.user = user;

//       //   // Add the user to the context
//       //   return obj;
//       // } else {
//       //   // token.replace("Bearer ","");

//       //   console.log("JWT Token  (Index file)");
//       //   console.log("---------------------------");

//       //   jwt.verify(token, process.env.secret, (err, decoded) => {
//       //     if (err) {
//       //       throw new AuthenticationError(
//       //         "Please provide a token to authorized otherwise you Unauthorized!"
//       //       );
//       //     }
//       //     // Add the user to the context
//       //     // const name = decoded.id;

//       //     obj.name = decoded.id;

//       //     obj.userTypeFromToken = "triage";
//       //     obj.userIdFromToken = "1a7bb02a-e615-4f85-bd6e-331a5df37dbe";

//       //     // console.log("obj.name = ", obj.name);
//       //     // console.log("obj.userTypeFromToken = ", obj.userTypeFromToken);
//       //     // console.log("obj.userIdFromToken = ", obj.userIdFromToken);

//       //     // console.log("---------------------------");
//       //   });
//       // console.log("---------------------------");
//       return obj;
//       // }
//     },
//   });

//   await server.start();

//   const app = express();
//   app.use(graphqlUploadExpress());

//   server.applyMiddleware({ app });
//   await new Promise((r) => app.listen({ port: 8080 }, r));

//   console.log(`🚀 Server ready at http://localhost:8080${server.graphqlPath}`);
// }
// //abc defgh
// startServer();

const express = require("express");
const { ApolloServer, gql } = require("apollo-server-express");
const jwt = require("jsonwebtoken");
const jwt_decode = require("jwt-decode");
const { GraphQLUpload, graphqlUploadExpress } = require("graphql-upload");
const { readFileSync } = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { resolvers } = require("./resolvers.js");

const prisma = new PrismaClient();

//-------------------

async function startServer() {
  // Set NODE_TLS_REJECT_UNAUTHORIZED to disable SSL certificate validation
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const server = new ApolloServer({
    typeDefs: readFileSync(path.join(__dirname, "schema.graphql"), "utf8"),
    resolvers,
    context: ({ req }) => {
      const obj = { prisma };

      const token = req.headers.authorization || null;

      if (!token) {
        throw new AuthenticationError("You must be logged in!");
      }

      obj.token = token;

      return obj;
    },
  });

  await server.start();

  const app = express();
  app.use(graphqlUploadExpress());

  server.applyMiddleware({ app });
  await new Promise((r) => app.listen({ port: 8080 }, r));

  console.log(`🚀 Server ready at http://localhost:8080${server.graphqlPath}`);
}

startServer();
