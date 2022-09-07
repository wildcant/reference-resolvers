import {
  GraphQLID,
  GraphQLList,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLString,
  GraphQLType,
} from 'graphql'
import {
  parseResolveInfo,
  ResolveTree,
  simplifyParsedResolveInfoFragmentWithType,
} from '../graphql-parse-resolve-info'

export const Reservation = new GraphQLObjectType({
  name: 'Reservation',
  fields: {
    _id: { type: GraphQLID },
    state: { type: GraphQLString },
  },
})

export const Reservations = new GraphQLObjectType({
  name: 'reservations',
  fields: () => ({
    nodes: { type: new GraphQLList(Reservation) },
  }),
})

export const Company = new GraphQLObjectType({
  name: 'Company',
  fields: {
    _id: { type: GraphQLID },
  },
})

export const Vehicle = new GraphQLObjectType({
  name: 'Vehicle',
  fields: {
    _id: { type: GraphQLID },
    customerVehicleNumber: { type: GraphQLString },
  },
})

export const Location = new GraphQLObjectType({
  name: 'Location',
  fields: {
    _id: { type: GraphQLID },
  },
})

export const getFields = (info: GraphQLResolveInfo, type: GraphQLType) => {
  const parsedResolveInfoFragment = parseResolveInfo(info)
  console.log(parsedResolveInfoFragment)
  const { fields } = simplifyParsedResolveInfoFragmentWithType(
    parsedResolveInfoFragment as ResolveTree,
    info.returnType
  )
  console.log(JSON.stringify(fields, null, 2))
  return Object.keys(fields)
}
