import { IResolvers } from '@graphql-tools/utils'
import { ApolloServer, gql } from 'apollo-server'
import DataLoader from 'dataloader'
import {
  GraphQLID,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLType,
  GraphQLFieldResolver,
  DocumentNode,
} from 'graphql'
import { Document, MongoClient, ObjectId } from 'mongodb'
import {
  parseResolveInfo,
  ResolveTree,
  simplifyParsedResolveInfoFragmentWithType,
} from '../graphql-parse-resolve-info'
const uri = 'mongodb://127.0.0.1:27017/tcoop_db_stage'

// Logger not working use monitor instead
// -> https://www.mongodb.com/docs/drivers/node/current/fundamentals/logging/
const client = new MongoClient(uri, { monitorCommands: true })
client.on('commandStarted', (event) =>
  console.debug('Command Started\n', JSON.stringify(event, null, 2))
)
client.on('commandSucceeded', (event) =>
  console.debug('Command Succeeded\n', JSON.stringify(event, null, 2))
)
client.on('commandFailed', (event) =>
  console.debug('Command Failed\n', JSON.stringify(event, null, 2))
)

const database = client.db('tcoop_db_stage')

const reservations = database.collection('reservations')
const companies = database.collection('companies')
const vehicles = database.collection('vehicles')

const Reservation = new GraphQLObjectType({
  name: 'Reservation',
  fields: {
    _id: { type: GraphQLID },
  },
})

const Company = new GraphQLObjectType({
  name: 'Company',
  fields: {
    _id: { type: GraphQLID },
  },
})

const Vehicle = new GraphQLObjectType({
  name: 'Vehicle',
  fields: {
    _id: { type: GraphQLID },
  },
})

const typeDefs = gql`
  scalar Date

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  enum ESort {
    ASC
    DESC
  }

  enum EReservationSortKey {
    state
    startDate
    endDate
    duration
  }

  enum RecommendedAction {
    approveRequest
    declineRequest
    cancelRequest
    beginChat
    archive
    pickupVehicle
    requestExtension
    cancelReservation
    sendPickUpPageLink
    getExtensionQuote
    sendDropoffLink
    dropOffVehicle
    markReservationLate
    sendDocumentVehicleLink
    approveExtensionRequest
    cancelExtensionRequest
    declineExtensionRequest
    getExtentionQuote
  }

  type Reservation {
    _id: ID!
    hash: String
    state: String
    startDate: Date
    endDate: Date
    duration: String
    borrowerCompany: Company
    lenderCompany: Company
    vehicle: Vehicle
    recommendedActions: [RecommendedAction!]
  }

  type Company {
    _id: String!
    name: String
  }

  type Vehicle {
    _id: String!
    customerVehicleNumber: String
    licensePlate: LicensePlate
    location: Location
    details: VehicleDetails
  }

  enum UserRole {
    admin
    billing
    owner
    sales
    super
  }

  type User {
    _id: String!
    company: Company
    role: UserRole
    userName: String
  }

  type LicensePlate {
    state: String
  }

  type Location {
    _id: String!
    timezone: String
  }

  type VehicleDetails {
    make: String
    model: String
  }

  type ReservationConnection {
    totalCount: Int!

    pageInfo: PageInfo!

    nodes: [Reservation!]!
  }

  type Query {
    reservation(_id: String): Reservation
    reservations(
      state: [String]
      hash: String
      lenderOrBorrowerId: String
      customerVehicleNumber: String
      sortBy: EReservationSortKey = state
      sortOrder: ESort = ASC
      offset: Int = 0
      limit: Int = 25
    ): ReservationConnection!
  }
`

const getFields = (info: GraphQLResolveInfo, type: GraphQLType) => {
  // console.log('** getFields **')
  const parsedResolveInfoFragment = parseResolveInfo(info)
  const { fields } = simplifyParsedResolveInfoFragmentWithType(
    parsedResolveInfoFragment as ResolveTree,
    type
  )
  // console.log(
  //   'parsedResolveInfoFragment: ',
  //   JSON.stringify(parsedResolveInfoFragment, null, 2),
  //   'fields: ',
  //   JSON.stringify(fields, null, 2),
  //   '\n\n\n',
  // )
  return Object.keys(fields)
}

type GenericResolver = GraphQLFieldResolver<any, any, any, Promise<any>>

const resolvers: { [entity: string]: { [key: string]: GenericResolver } } = {
  Query: {
    reservation: async (_, params, ctx, info) => {
      console.log('reservation')
      return ctx.reservationsLoader.load({
        key: params._id,
        fields: getFields(info, Reservation),
      })
    },
    reservations: async (_, params, context, info) => {
      console.log('reservations query')
      return {}
    },
  },
  Reservation: {
    borrowerCompany: (res, params, ctx, info) => {
      return ctx.companyLoader.load({
        key: res.borrowerCompany,
        fields: getFields(info, Company),
      })
    },
    /**
     * TODO: Only one level deep. we can't have location without populating query :/.
     */
    vehicle: (res, params, ctx, info) => {
      return ctx.vehicleLoader.load({
        key: res.vehicle,
        fields: getFields(info, Vehicle),
      })
    },
  },
}

type LoadFnKey = { key: ObjectId | string; fields?: Document }
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Loader within context.
  // https://github.com/graphql/dataloader/issues/95
  context: () => {
    return {
      // Load specific fields.
      // https://github.com/graphql/dataloader/issues/236
      reservationsLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        const fields = keys[0].fields ?? {}
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )

        console.log({ fields, ids })
        const response = await reservations
          .find({
            _id: { $in: [new ObjectId('62fd3b66398257001fc97a8f')] },
          })
          .project(fields)
          .toArray()
        console.log({ response })

        return response
      }),

      companyLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        const fields = keys[0].fields ?? {}
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )
        return await companies
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()
      }),

      vehicleLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        const fields = keys[0].fields ?? {}
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )

        return await vehicles
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()
      }),
    }
  },
})

server.listen().then(({ url }) => {
  console.log(`🚀  Serve ready at ${url}`)
})
