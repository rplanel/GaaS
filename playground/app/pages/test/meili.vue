<script lang="ts" setup>
// const movies = {
//   index: 'movies',
//   columns: [
//     { accessorKey: 'id', header: 'ID' },
//     { accessorKey: 'title', header: 'Title' },
//     { accessorKey: 'genres', header: 'Genres' },
//     { accessorKey: 'release_date', header: 'Release Date' },
//   ],
// }

const books = {
  index: 'books',
  columns: [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'author', header: 'Author' },
    { accessorKey: 'details.rating', header: 'Rating' },
    { accessorKey: 'publisher', header: 'Publisher' },
    { accessorKey: 'details.pages', header: 'Pages' },
  ],
}
</script>

<template>
  <UDashboardPanel id="meili-data-table" title="Meili Data Table">
    <template #body>
      <div>
        <!-- <h5>Movies</h5>
        <MeiliDataTable
          :meili-index="movies.index"
          :table-props="{
            columns: movies.columns,
            data: [],
          }"
        /> -->
        <h5>Books</h5>
        <MeiliDataTable
          :meili-index="books.index"
          :table-props="{
            columns: books.columns,
            data: [],
          }"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
