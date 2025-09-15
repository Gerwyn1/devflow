import QuestionCard from "@/components/cards/QuestionCard";
import DataRenderer from "@/components/DataRenderer";
import CommonFilter from "@/components/filters/CommonFilter";
import HomeFilter from "@/components/filters/HomeFilter";
import Pagination from "@/components/Pagination";
import LocalSearch from "@/components/search/LocalSearch";
import { Button } from "@/components/ui/button";
import { HomePageFilters } from "@/constants/filters";
import ROUTES from "@/constants/routes";
import { EMPTY_QUESTION } from "@/constants/states";
import { getQuestions } from "@/lib/actions/question.action";

import Link from "next/link";

// const questions = [
//   {
//     _id: "1",
//     title: "How to learn React?",
//     description: "I want to learn React, can anyone help me?",
//     tags: [
//       {
//         _id: "1",
//         name: "React",
//       },
//       {
//         _id: "2",
//         name: "JavaScript",
//       },
//     ],
//     author: {
//       _id: "1",
//       name: "John Doe",
//       image:
//         "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
//     },
//     upvotes: 10,
//     answers: 5,
//     views: 100,
//     createdAt: new Date(),
//   },
//   {
//     _id: "2",
//     title: "How to learn JavaScript?",
//     description: "I want to learn React, can anyone help me?",
//     tags: [
//       {
//         _id: "1",
//         name: "JavaScript",
//       },
//       {
//         _id: "2",
//         name: "JavaScript",
//       },
//     ],
//     author: {
//       _id: "1",
//       name: "Sarah",
//       image:
//         "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
//     },
//     upvotes: 10,
//     answers: 5,
//     views: 100,
//     createdAt: new Date(),
//   },
// ];

interface SearchParams {
  searchParams: Promise<{ [key: string]: string }>;
}

const Home = async ({ searchParams }: SearchParams) => {
  const { query, filter, page, pageSize } = await searchParams;

  const { success, data, error } = await getQuestions({
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 10,
    query: query || "",
    filter: filter || "",
  });

  const { questions, isNext } = data || {};

  // const filteredQuestions = questions?.filter((question) => {
  //   const matchesQuery = question.title.toLowerCase().includes(query.toLowerCase());
  //   const matchesFilter = filter ? question.tags[0].name.toLowerCase() === filter.toLowerCase() : true;
  //   return matchesQuery && matchesFilter;
  // });

  return (
    <>
      <section className="flex w-full flex-col-reverse justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="h1-bold text-dark100_light900">All Questions</h1>
        <Button className="primary-gradient min-h-[46px] px-4 py-3 !text-light-900" asChild>
          <Link href={ROUTES.ASK_QUESTION} className="max-sm:w-full">
            Ask a Question
          </Link>
        </Button>
      </section>
      <section className="mt-11 flex justify-between gap-5 max-sm:flex-col sm:items-center">
        <LocalSearch
          route={ROUTES.HOME}
          imgSrc="/icons/search.svg"
          placeholder="Search questions..."
          iconPosition="left"
          otherClasses="flex-1"
        />
        <CommonFilter
          filters={HomePageFilters}
          otherClasses="min-h-[56px] sm:min-w-[170px] "
          containerClasses="hidden max-md:flex "
        />
      </section>
      <HomeFilter />
      <DataRenderer
        success={success}
        error={error}
        data={questions}
        empty={EMPTY_QUESTION}
        render={(questions) => (
          <div className="mt-10 flex w-full flex-col gap-6">
            {questions.map((question) => (
              <QuestionCard key={question._id} question={question} />
            ))}
          </div>
        )}
      />
      <Pagination page={page} isNext={isNext || false} />
      {/* {success ? (
        <div className="mt-10 flex w-full flex-col gap-6">
          {questions && questions.length > 0 ? (
            questions.map((question) => <QuestionCard key={question._id} question={question} />)
          ) : (
            <div className="mt-10 flex w-full items-center justify-center">
              <p className="text-dark400_light700">No questions found</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-10 flex w-full items-center justify-center">
          <p className="text-dark400_light700">{error?.message || "Failed to fetch questions"}</p>
        </div>
      )} */}
    </>
  );
};

export default Home;
