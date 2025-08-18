'use client'

import React from 'react'
import Layout from '@/components/global/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'

const AddServicePage = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Add Service</h1>
          <p className="text-gray-600">Add new services to the hospital</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="h-5 w-5 text-blue-600" />
              <span>Service Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-500">
              <p>Add Service features will be implemented here</p>
              <p className="text-sm mt-2">This is a placeholder page for future development</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

export default AddServicePage