import { client } from "./client";

export const createUser = (nickname: string, email: string) => {
  return client.user.create({
    data: {
      nickname,
      email,
    },
  });
};

export const createUsers = (data: { nickname: string; email: string }[]) => {
  return client.user.createMany({
    data,
  });
};

export const countUser = () => {
  return client.user.count();
};

export const createTeam = (name: string) => {
  return client.team.create({
    data: {
      name,
    },
  });
};

export const countTeam = () => {
  return client.team.count();
};
