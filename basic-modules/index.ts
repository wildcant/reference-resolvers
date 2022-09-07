import { ApolloServer, gql } from 'apollo-server'
import DataLoader from 'dataloader'
import { GraphQLFieldResolver } from 'graphql'
import { Document, MongoClient, ObjectId } from 'mongodb'
import {
  Vehicle,
  Reservation,
  Reservations,
  Company,
  Location,
  getFields,
} from './projection'
const uri = 'mongodb://127.0.0.1:27017/tcoop_db_stage'

// Logger not working use monitor instead
// -> https://www.mongodb.com/docs/drivers/node/current/fundamentals/logging/
const client = new MongoClient(uri, { monitorCommands: true })
/*
client.on('commandStarted', (event) =>
  console.debug('Command Started\n', JSON.stringify(event, null, 2))
)
client.on('commandSucceeded', (event) =>
  console.debug('Command Succeeded\n', JSON.stringify(event, null, 2))
)
client.on('commandFailed', (event) =>
  console.debug('Command Failed\n', JSON.stringify(event, null, 2))
)
/* */

const database = client.db('tcoop_db_stage')

const reservations = database.collection('reservations')
const companies = database.collection('companies')
const vehicles = database.collection('vehicles')
const locations = database.collection('locations')

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
    _id: ID
    name: String
  }

  type Location {
    _id: ID
    timezone: String
  }

  type Vehicle {
    _id: ID
    customerVehicleNumber: String
    licensePlate: LicensePlate
    location: Location
    details: VehicleDetails
    vin: String
  }

  enum UserRole {
    admin
    billing
    owner
    sales
    super
  }

  type User {
    _id: ID
    company: Company
    role: UserRole
    userName: String
  }

  type LicensePlate {
    state: String
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

type ILocation = {
  _id: string
  timezone?: string
}

type IVehicle = {
  _id: string
  customerVehicleNumber: string
  licensePlate: {}
  location: string | ILocation
  details: {
    make: string
    model: string
  }
  vin: string
}

type GenericResolver = GraphQLFieldResolver<any, any, any, Promise<any>>

const resolvers: { [entity: string]: { [key: string]: GenericResolver } } = {
  Query: {
    reservation: async (_, params, ctx, info) => {
      return {
        __typename: 'Reservation',
        _id: params._id,
        fields: getFields(info, Reservation),
      }
    },
    reservations: async (_, params, context, info) => {
      console.log(JSON.stringify(info, null, 2))
      const fields = getFields(info, Reservations)
      const reservations = [{ _id: '5a0dc49ff4bcda1678bec03b' }]
      console.log(fields)
      return {
        totalCount: 10,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
        },
        nodes: reservations.map(({ _id }) => ({
          __typename: 'Reservation',
          _id,
          fields,
        })),
      }
    },
  },
  Vehicle: {
    __resolveObject(vehicle, params, ctx, info) {
      return ctx.vehicleLoader.load({
        key: vehicle._id,
        fields: vehicle.fields,
      })
    },
    location: (vehicle, params, ctx, info) => {
      return {
        __typename: 'Location',
        _id: vehicle.location,
        fields: getFields(info, Location),
      } as any
    },
  },
  Reservation: {
    __resolveObject: (reservation, params, ctx, info) => {
      console.log('Reservation__resolveObject', reservation._id)
      return ctx.reservationLoader.load({
        key: reservation._id,
        fields: reservation.fields,
      })
    },
    borrowerCompany: (res, params, ctx, info) => {
      return ctx.companyLoader.load({
        key: res.borrowerCompany,
        fields: getFields(info, Company),
      })
    },
    vehicle: (res, params, ctx, info) => {
      return {
        __typename: 'Vehicle',
        _id: res.vehicle,
        fields: getFields(info, Vehicle),
      } as any
    },
  },
  Location: {
    __resolveObject: (location, params, ctx, info) => {
      return ctx.locationLoader.load({
        key: location._id,
        fields: location.fields,
      })
    },
  },
}

type LoadFnKey = { key: ObjectId | string; fields?: Document }
const server = new ApolloServer({
  modules: [{ typeDefs, resolvers }],
  // Loader within context.
  // https://github.com/graphql/dataloader/issues/95
  context: () => {
    return {
      // Load specific fields.
      // https://github.com/graphql/dataloader/issues/236
      // TODO: Check that is batching requests correctly.
      reservationLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        console.log('reservationLoader')
        const fields = keys[0].fields ?? []
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )
        console.log({ fields, ids })
        const response = await reservations
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()
        console.log({ response })
        console.log('\n')
        return response
      }),

      companyLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        const fields = keys[0].fields ?? []
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )
        return await companies
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()
      }),

      vehicleLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        console.log('vehicleLoader')
        const fields = keys[0].fields ?? []
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )

        console.log({ fields, ids })
        let response = (await vehicles
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()) as any as IVehicle[]

        console.log({ response })
        console.log('\n')
        return response
      }),

      locationLoader: new DataLoader<LoadFnKey, Document>(async (keys) => {
        console.log('locationLoader')
        const fields = keys[0].fields ?? []
        const ids = keys.map(({ key }) =>
          key instanceof ObjectId ? key : new ObjectId(key)
        )
        console.log({ fields, ids })
        let response = await locations
          .find({ _id: { $in: ids } })
          .project(fields)
          .toArray()
        console.log({ response })
        console.log('\n')

        return response
      }),
    }
  },
})

server.listen().then(({ url }) => {
  console.log(`🚀  Serve ready at ${url}`)
})
