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
      return {
        prisma, // Include the prisma object
        _skipSSLValidation: true, // Set this property to true to skip SSL validation
      };
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
