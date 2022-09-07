import {ApolloServer, gql} from 'apollo-server'

const typeDefs = gql`
  type Query {
    me: User
  }

  type User {
    _id: ID!
    username: String
  }
`

const resolvers = {
  Query: {
    me() {
      return {_id: '1'}
    },
  },
  User: {
    // Modules middleware => https://www.graphql-modules.com/docs/advanced/middlewares
    __resolveObject: () => {
      return new Promise(res =>
        setTimeout(() => {
          res({_id: '1', username: 'pep'})
        }, 10),
      )
    },
  },
}

const server = new ApolloServer({
  modules: [
    {
      typeDefs,
      resolvers,
    },
  ],
})

server.listen(4001).then(({url}) => {
  console.log(`🚀 Server ready at ${url}`)
})
